/**
 * Cognate (Coglim) BUREMBA branch data export for rembeh migration.
 * Exports members, loan statements, and date-range financial transactions.
 */
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT_DIR = path.join(ROOT, "data/coglim-export");

const BASE = "https://www.coglim.com/cognate";
const LOGIN_URL = `${BASE}/Admin/`;
const MEMBER_LIST_URL = `${BASE}/client/member_list.php`;
const GET_TX_URL = `${BASE}/client/get.php`;

const OFFICE = process.env.COGLIM_OFFICE || "BUREMBA";
const USERNAME = process.env.COGLIM_USER || "sam";
const PASSWORD = process.env.COGLIM_PASS || "perform";
const TX_START = process.env.COGLIM_TX_START || "2020-01-01";
const TX_END = process.env.COGLIM_TX_END || new Date().toISOString().slice(0, 10);
const HEADLESS = process.env.HEADLESS !== "0";

function slugify(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function clean(text) {
  return String(text ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isDash(value) {
  const v = clean(value);
  return !v || v === "--" || v === "-" || v === "—";
}

function parseMemberDetailsHtml(html) {
  const getInput = (name) => {
    const re = new RegExp(`name=["']${name}["'][^>]*value=["']([^"']*)["']`, "i");
    const re2 = new RegExp(`value=["']([^"']*)["'][^>]*name=["']${name}["']`, "i");
    return clean((html.match(re) || html.match(re2) || [])[1] || "");
  };
  return {
    id: getInput("sid") || null,
    name: getInput("studentname") || null,
    regDate: getInput("regno") || null,
    phone: getInput("phone") || null,
  };
}

async function postForm(page, url, fields) {
  return page.evaluate(
    async ({ url, fields }) => {
      const body = new URLSearchParams(fields).toString();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      return { status: res.status, html: await res.text() };
    },
    { url, fields },
  );
}

/** Parse statement HTML in-browser so nested tables are handled correctly. */
async function parseStatementInPage(page, html, memberId) {
  return page.evaluate(
    ({ html, memberId }) => {
      const clean = (t) =>
        String(t ?? "")
          .replace(/\u00a0/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      const isDash = (v) => {
        const s = clean(v);
        return !s || s === "--" || s === "-" || s === "—";
      };
      const doc = new DOMParser().parseFromString(html, "text/html");
      const nameEl = [...doc.querySelectorAll("*")].find((el) =>
        /Statement For/i.test(el.textContent || ""),
      );
      const nameMatch = (nameEl?.textContent || "").match(/Statement For\s*(.+)/i);
      const memberName = nameMatch ? clean(nameMatch[1]) : null;

      let targetTable = null;
      for (const table of doc.querySelectorAll("table")) {
        const headers = [...table.querySelectorAll("th")].map((th) => clean(th.textContent));
        if (headers.some((h) => /trans\.?\s*id/i.test(h)) && headers.some((h) => /principal/i.test(h))) {
          targetTable = table;
          break;
        }
      }
      if (!targetTable) {
        // Fallback: largest table with 7-column rows
        let best = null;
        let bestCount = 0;
        for (const table of doc.querySelectorAll("table")) {
          const count = [...table.querySelectorAll("tr")].filter(
            (tr) => tr.querySelectorAll("td").length >= 6,
          ).length;
          if (count > bestCount) {
            best = table;
            bestCount = count;
          }
        }
        targetTable = best;
      }

      const events = [];
      if (targetTable) {
        for (const tr of targetTable.querySelectorAll("tr")) {
          const cells = [...tr.querySelectorAll("td")].map((td) => clean(td.textContent));
          if (cells.length < 6) continue;
          const [transId, dateOfLoan, dateOfPay, principal, totalReturn, amountPaid, balance] =
            cells;
          if (!transId || isDash(transId) || /trans/i.test(transId)) continue;
          events.push({
            transId,
            dateOfLoan: isDash(dateOfLoan) ? null : dateOfLoan,
            dateOfPay: isDash(dateOfPay) ? null : dateOfPay,
            principal: isDash(principal) ? null : principal,
            totalReturn: isDash(totalReturn) ? null : totalReturn,
            amountPaid: isDash(amountPaid) ? null : amountPaid,
            balance: isDash(balance) ? null : balance,
          });
        }
      }

      return { memberId, memberName, events };
    },
    { html, memberId },
  );
}

async function login(page) {
  console.log(`Logging in as ${USERNAME} @ ${OFFICE}...`);
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60000 });

  const officeInput = page.getByPlaceholder(/search or select office/i);
  await officeInput.click();
  await officeInput.fill(OFFICE);
  // Select matching option from listbox / dropdown
  const option = page.getByRole("option", { name: new RegExp(`^${OFFICE}$`, "i") });
  if (await option.count()) {
    await option.first().click();
  } else {
    // Fallback: click list item text
    const item = page.locator(`text=/^${OFFICE}$/i`).first();
    if (await item.count()) await item.click();
    else await page.keyboard.press("Enter");
  }

  await page.getByPlaceholder(/enter your username/i).fill(USERNAME);
  await page.getByPlaceholder(/enter your password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/client\/dashboard\.php|member_list|client\//, { timeout: 60000 });
  console.log("Login OK:", page.url());
}

async function scrapeMembers(page) {
  console.log("Scraping member list...");
  await page.goto(MEMBER_LIST_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("#example1 tbody tr", { timeout: 60000 });

  // Show max entries per page
  const lengthSelect = page.locator('select[name="example1_length"]');
  if (await lengthSelect.count()) {
    await lengthSelect.selectOption("100");
    await page.waitForTimeout(800);
  }

  const members = [];
  let pageNum = 1;
  while (true) {
    const batch = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("#example1 tbody tr")];
      return rows
        .map((tr) => {
          const tds = [...tr.querySelectorAll("td")];
          if (tds.length < 5) return null;
          const idBtn = tr.querySelector("button.edit_data, button.edit_data2, button.edit_data3");
          const deleteLink = tr.querySelector('a[href*="del=delete"]');
          const idFromDelete = deleteLink?.href?.match(/[?&]id=(\d+)/)?.[1];
          return {
            id: idBtn?.id || idFromDelete || null,
            systemNumber: (tds[2]?.textContent || "").trim(),
            name: (tds[3]?.textContent || "").trim(),
            telephone: (tds[4]?.textContent || "").trim(),
          };
        })
        .filter(Boolean);
    });

    for (const m of batch) {
      if (!members.some((x) => x.id === m.id && x.systemNumber === m.systemNumber)) {
        members.push(m);
      }
    }
    console.log(`  page ${pageNum}: +${batch.length} (total ${members.length})`);

    const next = page.locator("#example1_paginate .paginate_button.next:not(.disabled)");
    if (!(await next.count())) break;
    await next.click();
    await page.waitForTimeout(700);
    pageNum += 1;
    if (pageNum > 50) break;
  }

  return members;
}

async function enrichMember(page, member) {
  const base = `${BASE}/client`;
  const [editRes, viewRes, stmtRes] = await Promise.all([
    postForm(page, `${base}/edit_student.php`, { edit_id: member.id }),
    postForm(page, `${base}/view_student_info.php`, { edit_id2: member.id }),
    postForm(page, `${base}/statement.php`, { edit_id3: member.id }),
  ]);

  const details = parseMemberDetailsHtml(editRes.html);
  const statement = await parseStatementInPage(page, stmtRes.html, member.id);

  return {
    ...member,
    details: {
      ...details,
      id: details.id || member.id,
      name: details.name || member.name,
      phone: details.phone || member.telephone,
    },
    viewHtmlSnippet: viewRes.html.slice(0, 500),
    statement,
    loanHistory: statement.events,
  };
}

async function scrapeTransactions(page) {
  console.log(`Scraping transactions ${TX_START} → ${TX_END}...`);
  await page.goto(GET_TX_URL, { waitUntil: "domcontentloaded", timeout: 60000 });

  // Second form: date-only filter (submit3)
  const dateForm = page.locator('form[action="got.php"]').filter({ has: page.locator('button[name="submit3"]') });
  if (await dateForm.count()) {
    await dateForm.locator('input[name="date"]').fill(TX_START);
    await dateForm.locator('input[name="date1"]').fill(TX_END);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 120000 }).catch(() => {}),
      dateForm.locator('button[name="submit3"]').click(),
    ]);
  } else {
    // Fallback: any got.php form
    await page.locator('input[name="date"]').last().fill(TX_START);
    await page.locator('input[name="date1"]').last().fill(TX_END);
    await page.locator('button:has-text("Submit")').last().click();
    await page.waitForLoadState("domcontentloaded");
  }

  await page.waitForTimeout(1500);

  // Expand datatable if present
  const lengthSelect = page.locator("select[name$=_length]").first();
  if (await lengthSelect.count()) {
    const opts = await lengthSelect.locator("option").allTextContents();
    const max = opts.includes("100") ? "100" : opts[opts.length - 1];
    await lengthSelect.selectOption(max.trim());
    await page.waitForTimeout(800);
  }

  const allRows = [];
  let pageNum = 1;
  while (true) {
    const { headers, rows } = await page.evaluate(() => {
      const table =
        document.querySelector("table.dataTable") ||
        document.querySelector(".card-body table") ||
        document.querySelector("table");
      if (!table) return { headers: [], rows: [] };
      const headers = [...table.querySelectorAll("thead th")].map((th) =>
        th.textContent.replace(/\s+/g, " ").trim(),
      );
      const rows = [...table.querySelectorAll("tbody tr")].map((tr) =>
        [...tr.querySelectorAll("td")].map((td) => td.textContent.replace(/\s+/g, " ").trim()),
      );
      return { headers, rows };
    });

    for (const cells of rows) {
      if (!cells.length || cells.every((c) => !c)) continue;
      if (headers.length === cells.length) {
        const obj = {};
        headers.forEach((h, i) => {
          obj[h || `col_${i}`] = isDash(cells[i]) ? null : cells[i];
        });
        allRows.push(obj);
      } else {
        allRows.push({ cells });
      }
    }
    console.log(`  tx page ${pageNum}: +${rows.length} (total ${allRows.length})`);

    const next = page.locator(".paginate_button.next:not(.disabled)").first();
    if (!(await next.count())) break;
    await next.click();
    await page.waitForTimeout(700);
    pageNum += 1;
    if (pageNum > 200) break;
  }

  // Also keep raw page text summary
  const pageText = await page.evaluate(() => document.body?.innerText?.slice(0, 2000) || "");
  return { start: TX_START, end: TX_END, count: allRows.length, rows: allRows, pageTextPreview: pageText };
}

function toCsv(rows) {
  if (!rows.length) return "";
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /["\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  try {
    await login(page);
    const members = await scrapeMembers(page);
    console.log(`Members found: ${members.length}`);

    const enriched = [];
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      process.stdout.write(`  enrich ${i + 1}/${members.length} id=${m.id} ${m.name}\r`);
      try {
        enriched.push(await enrichMember(page, m));
      } catch (err) {
        console.error(`\n  failed member ${m.id}:`, err.message);
        enriched.push({ ...m, error: err.message, loanHistory: [] });
      }
      // light throttle
      if (i % 10 === 9) await page.waitForTimeout(300);
    }
    console.log(`\nEnriched ${enriched.length} members`);

    const transactions = await scrapeTransactions(page);

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      branch: OFFICE,
      source: BASE,
      summary: {
        memberCount: enriched.length,
        loanEventCount: enriched.reduce((n, m) => n + (m.loanHistory?.length || 0), 0),
        transactionCount: transactions.count,
        transactionRange: { start: TX_START, end: TX_END },
      },
      members: enriched,
      transactions,
    };

    const outputPrefix = slugify(OFFICE) || "branch";
    const jsonPath = path.join(OUT_DIR, `${outputPrefix}-export-${stamp}.json`);
    const latestJson = path.join(OUT_DIR, `${outputPrefix}-latest.json`);
    await fs.writeFile(jsonPath, JSON.stringify(exportPayload, null, 2));
    await fs.writeFile(latestJson, JSON.stringify(exportPayload, null, 2));

    const membersCsv = toCsv(
      enriched.map((m) => ({
        id: m.id,
        systemNumber: m.systemNumber,
        name: m.details?.name || m.name,
        phone: m.details?.phone || m.telephone,
        regDate: m.details?.regDate || "",
        loanEvents: m.loanHistory?.length || 0,
      })),
    );
    const loanCsv = toCsv(
      enriched.flatMap((m) =>
        (m.loanHistory || []).map((e) => ({
          memberId: m.id,
          systemNumber: m.systemNumber,
          memberName: m.details?.name || m.name,
          ...e,
        })),
      ),
    );
    const txCsv = toCsv(transactions.rows);

    await fs.writeFile(path.join(OUT_DIR, `${outputPrefix}-members.csv`), membersCsv);
    await fs.writeFile(path.join(OUT_DIR, `${outputPrefix}-loan-history.csv`), loanCsv);
    await fs.writeFile(path.join(OUT_DIR, `${outputPrefix}-transactions.csv`), txCsv);

    const summaryPath = path.join(OUT_DIR, `${outputPrefix}-summary.json`);
    await fs.writeFile(summaryPath, JSON.stringify(exportPayload.summary, null, 2));

    console.log("\nExport complete:");
    console.log(`  ${jsonPath}`);
    console.log(`  ${path.join(OUT_DIR, `${outputPrefix}-members.csv`)}`);
    console.log(`  ${path.join(OUT_DIR, `${outputPrefix}-loan-history.csv`)}`);
    console.log(`  ${path.join(OUT_DIR, `${outputPrefix}-transactions.csv`)}`);
    console.log(JSON.stringify(exportPayload.summary, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
