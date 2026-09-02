/**
 * Cognate (Coglim) ISHONGORORO full-book export for rembeh migration.
 * Pulls every office ledger, then organises it into borrower-centric loans.
 */
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

const BASE = "https://www.coglim.com/cognate";
const LOGIN_URL = `${BASE}/Admin/`;
const CLIENT = `${BASE}/client`;

const OFFICE = process.env.COGLIM_OFFICE || "ISHONGORORO";
const USERNAME = process.env.COGLIM_USER || "sam";
const PASSWORD = process.env.COGLIM_PASS || "perform";
const TX_START = process.env.COGLIM_TX_START || "2020-01-01";
const TX_END = process.env.COGLIM_TX_END || new Date().toISOString().slice(0, 10);
const HEADLESS = process.env.HEADLESS !== "0";
const SLUG = (
  process.env.COGLIM_SLUG ||
  OFFICE.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
);
const OUT_DIR = path.join(ROOT, `data/coglim-export/${SLUG}`);
const BRANCH_LABEL =
  process.env.COGLIM_BRANCH_LABEL ||
  OFFICE.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

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
  return !v || v === "--" || v === "-" || v === "—" || v === "0000-00-00";
}

function parseMoney(value) {
  if (isDash(value)) return null;
  const n = Number(String(value).replace(/,/g, "").replace(/Shs/gi, "").trim());
  return Number.isFinite(n) ? n : null;
}

function parseDate(value) {
  if (isDash(value)) return null;
  const v = clean(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const dmy = v.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmy) {
    const [, dd, mm, yyyy] = dmy;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  const dt = v.match(/^(\d{4}-\d{2}-\d{2})[ T]/);
  if (dt) return dt[1];
  return v;
}

function nameKey(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function sum(values, pick) {
  return round2(values.reduce((n, row) => n + (Number(pick ? pick(row) : row) || 0), 0));
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

async function fetchHtml(page, url) {
  return page.evaluate(async (url) => {
    const res = await fetch(url, { redirect: "follow" });
    return { status: res.status, url: res.url, html: await res.text() };
  }, url);
}

async function parseTablesFromHtml(page, html) {
  return page.evaluate((html) => {
    const clean = (t) =>
      String(t ?? "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const doc = new DOMParser().parseFromString(html, "text/html");
    return [...doc.querySelectorAll("table")].map((table, index) => {
      const headers = [...table.querySelectorAll("th")].map((th) => clean(th.textContent));
      const rows = [...table.querySelectorAll("tbody tr")].map((tr) => {
        const cells = [...tr.querySelectorAll("td")].map((td) => clean(td.textContent));
        const idBtn = tr.querySelector("button[id], a[href*='id=']");
        const href = tr.querySelector("a[href]")?.getAttribute("href") || "";
        const img = tr.querySelector("img")?.getAttribute("src") || "";
        const id =
          idBtn?.id ||
          href.match(/[?&]id=(\d+)/)?.[1] ||
          null;
        return { cells, id, href, img };
      });
      return {
        index,
        id: table.id || "",
        headers,
        rows: rows.filter((r) => r.cells.some((c) => c && c !== "--")),
      };
    });
  }, html);
}

function tableToObjects(table, mapFn) {
  return (table?.rows || []).map((row, i) => mapFn(row, i, table.headers || []));
}

async function login(page) {
  console.log(`Logging in as ${USERNAME} @ ${OFFICE}...`);
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(400);
  await page.evaluate((office) => {
    const sel = document.querySelector("#saved");
    if (sel) {
      sel.value = office;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const inp = document.querySelector("#filterInput");
    if (inp) inp.value = office;
  }, OFFICE);
  await page.locator('input[name="username"]').fill(USERNAME);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/client\/dashboard\.php/, { timeout: 60000 });
  console.log("Login OK:", page.url());
}

async function scrapeDashboard(page) {
  const { html } = await fetchHtml(page, `${CLIENT}/dashboard.php`);
  return page.evaluate((html) => {
    const clean = (t) => (t || "").replace(/\s+/g, " ").trim();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const text = clean(doc.body?.innerText);
    const members = Number((text.match(/([\d,]+)\s+Total Members/i) || [])[1]?.replace(/,/g, "") || 0);
    const defaulters = Number((text.match(/([\d,]+)\s+Defaulters/i) || [])[1]?.replace(/,/g, "") || 0);
    const expected = Number(
      (text.match(/([\d,]+)\s*Shs\s+Daily Expected Collection/i) || [])[1]?.replace(/,/g, "") || 0,
    );
    const collected = Number(
      (text.match(/([\d,]+)\s*Shs\s+Amount Collected/i) || [])[1]?.replace(/,/g, "") || 0,
    );
    const welcome = (text.match(/Welcome,\s*(.+?)\s+Office/i) || [])[1] || null;
    return { members, defaulters, dailyExpectedCollection: expected, amountCollectedToday: collected, welcome };
  }, html);
}

async function scrapeProfile(page) {
  const { html } = await fetchHtml(page, `${CLIENT}/profile.php`);
  return page.evaluate((html) => {
    const clean = (t) => (t || "").replace(/\s+/g, " ").trim();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const inputs = Object.fromEntries(
      [...doc.querySelectorAll("input")].map((el) => [el.name || el.id || el.type, el.value]),
    );
    const text = clean(doc.body?.innerText);
    const email = (text.match(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i) || [])[1] || null;
    const phone = (text.match(/(?:^|\s)(0?\d{9,12})(?:\s|$)/) || [])[1] || null;
    return {
      displayName: inputs.username || inputs.name || inputs.uname || null,
      email,
      phone,
      inputs,
      snippet: text.replace(/Home Welcome[\s\S]*Logout\s*/i, "").slice(0, 400),
    };
  }, html);
}

async function scrapePagedTable(page, url, options = {}) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(800);
  const lengthSelect = page.locator('select[name$="_length"]').first();
  if (await lengthSelect.count()) {
    const opts = await lengthSelect.locator("option").allTextContents();
    const max = opts.map((o) => o.trim()).includes("100") ? "100" : opts[opts.length - 1]?.trim();
    if (max) {
      await lengthSelect.selectOption(max);
      await page.waitForTimeout(700);
    }
  }

  const all = [];
  let pageNum = 1;
  while (true) {
    const batch = await page.evaluate((tableHint) => {
      const clean = (t) => (t || "").replace(/\s+/g, " ").trim();
      const table =
        (tableHint && document.querySelector(tableHint)) ||
        document.querySelector("table.dataTable") ||
        document.querySelector("table");
      if (!table) return { headers: [], rows: [] };
      const headers = [...table.querySelectorAll("thead th, tr th")].map((th) => clean(th.textContent));
      const rows = [...table.querySelectorAll("tbody tr")].map((tr) => {
        const cells = [...tr.querySelectorAll("td")].map((td) => clean(td.textContent));
        const href = tr.querySelector("a[href]")?.getAttribute("href") || "";
        const img = tr.querySelector("img")?.getAttribute("src") || "";
        const idBtn = tr.querySelector("button[id]");
        return {
          cells,
          id: idBtn?.id || href.match(/[?&]id=(\d+)/)?.[1] || null,
          href,
          img,
        };
      });
      return { headers, rows: rows.filter((r) => r.cells.some((c) => c && c !== "--")) };
    }, options.tableSelector || "");

    for (const row of batch.rows) {
      const key = `${row.id || ""}|${row.cells.join("|")}`;
      if (!all.some((x) => `${x.id || ""}|${x.cells.join("|")}` === key)) {
        all.push({ ...row, headers: batch.headers });
      }
    }
    console.log(`  ${options.label || url} page ${pageNum}: +${batch.rows.length} (unique ${all.length})`);

    const next = page.locator(".paginate_button.next:not(.disabled)").first();
    if (!(await next.count())) break;
    await next.click();
    await page.waitForTimeout(650);
    pageNum += 1;
    if (pageNum > (options.maxPages || 80)) break;
  }
  return all;
}

async function scrapeStaticTable(page, file, pickTable) {
  const { html } = await fetchHtml(page, `${CLIENT}/${file}`);
  const tables = await parseTablesFromHtml(page, html);
  const table = pickTable ? pickTable(tables) : tables.find((t) => t.rows.length) || tables[0];
  return table || { headers: [], rows: [] };
}

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
      const nameEl = [...doc.querySelectorAll("*")].find((el) => /Statement For/i.test(el.textContent || ""));
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

      const events = [];
      if (targetTable) {
        for (const tr of targetTable.querySelectorAll("tr")) {
          const cells = [...tr.querySelectorAll("td")].map((td) => clean(td.textContent));
          if (cells.length < 6) continue;
          const [transId, dateOfLoan, dateOfPay, principal, totalReturn, amountPaid, balance] = cells;
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

async function enrichMember(page, member) {
  const [editRes, viewRes, stmtRes] = await Promise.all([
    postForm(page, `${CLIENT}/edit_student.php`, { edit_id: member.id }),
    postForm(page, `${CLIENT}/view_student_info.php`, { edit_id2: member.id }),
    postForm(page, `${CLIENT}/statement.php`, { edit_id3: member.id }),
  ]);
  const details = parseMemberDetailsHtml(editRes.html);
  const statement = await parseStatementInPage(page, stmtRes.html, member.id);
  const viewText = clean(
    (viewRes.html.match(/<body[\s\S]*$/i) || [viewRes.html])[0]
      .replace(/<[^>]+>/g, " ")
      .slice(0, 400),
  );
  return {
    ...member,
    details: {
      ...details,
      id: details.id || member.id,
      name: details.name || member.name,
      phone: details.phone || member.phone,
    },
    viewText,
    statement,
  };
}

function groupLoansFromStatement(member) {
  const events = member.statement?.events || [];
  const loans = [];
  let current = null;
  for (const raw of events) {
    const issue = {
      transId: clean(raw.transId),
      issuedOn: parseDate(raw.dateOfLoan),
      dueOn: null,
      principal: parseMoney(raw.principal),
      totalReturn: parseMoney(raw.totalReturn),
    };
    const payment = {
      paidOn: parseDate(raw.dateOfPay),
      amount: parseMoney(raw.amountPaid),
      balanceAfter: parseMoney(raw.balance),
    };

    if (issue.principal != null) {
      const interestRate =
        issue.principal > 0 && issue.totalReturn != null
          ? round2(((issue.totalReturn / issue.principal) - 1) * 100)
          : null;
      current = {
        sourceMemberId: member.id,
        sourceTransId: issue.transId,
        borrowerName: member.details?.name || member.name,
        borrowerPhone: member.details?.phone || member.phone,
        systemNumber: member.systemNumber,
        issuedOn: issue.issuedOn,
        dueOn: issue.dueOn,
        principal: issue.principal,
        totalReturn: issue.totalReturn,
        interestRatePercent: interestRate,
        payments: [],
        currentBalance: issue.totalReturn,
        status: "CURRENT",
      };
      loans.push(current);
    }

    if (payment.amount != null || payment.paidOn || payment.balanceAfter != null) {
      if (!current) {
        current = {
          sourceMemberId: member.id,
          sourceTransId: clean(raw.transId),
          borrowerName: member.details?.name || member.name,
          borrowerPhone: member.details?.phone || member.phone,
          systemNumber: member.systemNumber,
          issuedOn: null,
          dueOn: null,
          principal: null,
          totalReturn: null,
          interestRatePercent: null,
          payments: [],
          currentBalance: payment.balanceAfter,
          status: "CURRENT",
        };
        loans.push(current);
      }
      if (payment.amount != null || payment.paidOn) {
        current.payments.push(payment);
      }
      if (payment.balanceAfter != null) current.currentBalance = payment.balanceAfter;
    }
  }

  for (const loan of loans) {
    const paid = sum(loan.payments, (p) => p.amount);
    loan.amountPaid = paid;
    if (loan.currentBalance == null && loan.totalReturn != null) {
      loan.currentBalance = round2(loan.totalReturn - paid);
    }
    const bal = Number(loan.currentBalance);
    if (Number.isFinite(bal) && bal <= 0) loan.status = "CLOSED";
    else if (Number.isFinite(bal) && bal > 0) loan.status = "CURRENT";
    else loan.status = "UNKNOWN";
  }
  return loans;
}

async function scrapeTransactions(page) {
  console.log(`Scraping transactions ${TX_START} → ${TX_END}...`);
  const rows = await page.evaluate(
    async ({ url, start, end }) => {
      const body = new URLSearchParams({ date: start, date1: end, submit3: "" }).toString();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const clean = (t) => (t || "").replace(/\s+/g, " ").trim();
      const table = doc.querySelector("#customers") || doc.querySelector("table");
      if (!table) return [];
      const headers = [...table.querySelectorAll("th")].map((th) => clean(th.textContent));
      return [...table.querySelectorAll("tbody tr")]
        .map((tr) => [...tr.querySelectorAll("td")].map((td) => clean(td.textContent)))
        .filter((cells) => cells.some(Boolean))
        .map((cells) => {
          const obj = {};
          headers.forEach((h, i) => {
            obj[h || `col_${i}`] = cells[i] || null;
          });
          return obj;
        });
    },
    { url: `${CLIENT}/got.php`, start: TX_START, end: TX_END },
  );
  return rows.map((row) => ({
    rowNumber: row.SN || row["S/N"] || null,
    paidOn: parseDate(row["Date Of Pay"] || row.Date || row.date),
    name: row.Name || row.name || null,
    amount: parseMoney(row["Amount Paid"] || row.Amount || row.amount),
    enteredBy: row["Entered By"] || row.enteredBy || null,
  }));
}

function buildOrganised(input) {
  const members = input.members.map((member) => {
    const loans = groupLoansFromStatement(member);
    const currentLoans = loans.filter((l) => l.status === "CURRENT");
    const latest = [...loans].reverse()[0] || null;
    const defaulter = input.defaulters.find((d) => nameKey(d.name) === nameKey(member.details?.name || member.name));
    return {
      sourceId: member.id,
      systemNumber: member.systemNumber,
      name: member.details?.name || member.name,
      phone: member.details?.phone || member.phone,
      registeredOn: parseDate(member.details?.regDate) || member.regDate || null,
      photoUrl: member.photoUrl || null,
      loanCycleCount: loans.length,
      paymentCount: loans.reduce((n, l) => n + l.payments.length, 0),
      currentBalance: latest?.currentBalance ?? 0,
      openLoanCount: currentLoans.length,
      isDefaulter: Boolean(defaulter),
      defaulter: defaulter || null,
      loans,
    };
  });

  const loans = members.flatMap((m) => m.loans);
  const repayments = loans.flatMap((loan) =>
    loan.payments.map((p) => ({
      sourceMemberId: loan.sourceMemberId,
      systemNumber: loan.systemNumber,
      borrowerName: loan.borrowerName,
      sourceTransId: loan.sourceTransId,
      loanIssuedOn: loan.issuedOn,
      paidOn: p.paidOn,
      amount: p.amount,
      balanceAfter: p.balanceAfter,
    })),
  );

  const memberByName = new Map(members.map((m) => [nameKey(m.name), m]));
  const officialOpen = (input.issuedLoans || []).filter((row) => (row.balance || 0) > 0);
  const currentPortfolio = officialOpen.length
    ? officialOpen.map((row) => {
        const member = memberByName.get(nameKey(row.name));
        const open = member?.loans?.filter((l) => l.status === "CURRENT").at(-1);
        return {
          sourceId: member?.sourceId || row.sourceId,
          systemNumber: member?.systemNumber || null,
          name: row.name,
          phone: member?.phone || null,
          issuedOn: row.issueDate,
          dueOn: row.payDate,
          principal: row.principal,
          totalReturn: row.amountToPay,
          interestRatePercent:
            row.principal > 0 && row.amountToPay != null
              ? round2(((row.amountToPay / row.principal) - 1) * 100)
              : open?.interestRatePercent || null,
          amountPaid:
            row.amountToPay != null && row.balance != null
              ? round2(row.amountToPay - row.balance)
              : open?.amountPaid || null,
          currentBalance: row.balance,
          paymentCount: open?.payments?.length || 0,
          lastPaymentOn: open?.payments?.at(-1)?.paidOn || null,
          isDefaulter: Boolean(member?.isDefaulter),
          sourceLoanId: row.sourceId,
        };
      })
    : members
        .map((m) => {
          const open = [...m.loans].reverse().find((l) => l.status === "CURRENT") || null;
          if (!open) return null;
          return {
            sourceId: m.sourceId,
            systemNumber: m.systemNumber,
            name: m.name,
            phone: m.phone,
            issuedOn: open.issuedOn,
            principal: open.principal,
            totalReturn: open.totalReturn,
            interestRatePercent: open.interestRatePercent,
            amountPaid: open.amountPaid,
            currentBalance: open.currentBalance,
            paymentCount: open.payments.length,
            lastPaymentOn: open.payments.at(-1)?.paidOn || null,
            isDefaulter: m.isDefaulter,
          };
        })
        .filter(Boolean);

  return {
    members,
    loans,
    repayments,
    currentPortfolio,
    totals: {
      members: members.length,
      loanCycles: loans.length,
      openLoans: currentPortfolio.length,
      closedLoans: loans.filter((l) => l.status === "CLOSED").length,
      repayments: repayments.length,
      principalIssued: sum(loans, (l) => l.principal),
      totalReturnIssued: sum(loans, (l) => l.totalReturn),
      collectedFromStatements: sum(repayments, (p) => p.amount),
      openPortfolioBalance: sum(currentPortfolio, (r) => r.currentBalance),
      capitalIn: sum(input.capital, (r) => r.amount),
      expenditures: sum(input.expenditures, (r) => r.amount),
      excessShortage: sum(input.excess, (r) => r.amount),
      transactionRows: input.transactions.length,
      transactionAmount: sum(input.transactions, (r) => parseMoney(r.Amount || r.amount || r["Amount Paid"])),
      defaulters: input.defaulters.length,
      officers: input.officers.length,
    },
  };
}

async function writeOutputs(payload) {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const organised = payload.organised;

  const files = {
    [`${SLUG}-full-${stamp}.json`]: payload,
    [`${SLUG}-latest.json`]: payload,
    "summary.json": {
      exportedAt: payload.exportedAt,
      branch: payload.branch,
      dashboard: payload.dashboard,
      totals: organised.totals,
    },
    "01-members.csv": toCsv(
      organised.members.map((m) => ({
        sourceId: m.sourceId,
        systemNumber: m.systemNumber,
        name: m.name,
        phone: m.phone,
        registeredOn: m.registeredOn,
        loanCycles: m.loanCycleCount,
        payments: m.paymentCount,
        currentBalance: m.currentBalance,
        isDefaulter: m.isDefaulter ? "yes" : "no",
      })),
    ),
    "02-loan-cycles.csv": toCsv(
      organised.loans.map((l) => ({
        sourceMemberId: l.sourceMemberId,
        systemNumber: l.systemNumber,
        borrowerName: l.borrowerName,
        phone: l.borrowerPhone,
        issuedOn: l.issuedOn,
        principal: l.principal,
        totalReturn: l.totalReturn,
        interestRatePercent: l.interestRatePercent,
        amountPaid: l.amountPaid,
        currentBalance: l.currentBalance,
        paymentCount: l.payments.length,
        status: l.status,
      })),
    ),
    "03-repayments.csv": toCsv(organised.repayments),
    "04-current-portfolio.csv": toCsv(organised.currentPortfolio),
    "05-defaulters.csv": toCsv(payload.defaulters),
    "06-issued-loans-ledger.csv": toCsv(payload.issuedLoans),
    "07-capital.csv": toCsv(payload.capital),
    "08-expenditures.csv": toCsv(payload.expenditures),
    "09-expense-categories.csv": toCsv(payload.expenseCategories),
    "10-excess-shortage.csv": toCsv(payload.excess),
    "11-officers.csv": toCsv(payload.officers),
    "12-transactions.csv": toCsv(payload.transactions),
    "13-current-positions.csv": toCsv(payload.currentPositions),
    "14-rembeh-ready.json": {
      tenantHint: "Cognate",
      branchHint: BRANCH_LABEL,
      source: BASE,
      exportedAt: payload.exportedAt,
      manager: payload.profile,
      officers: payload.officers,
      customers: organised.members.map((m) => ({
        sourceId: m.sourceId,
        systemNumber: m.systemNumber,
        fullName: m.name,
        phone: m.phone,
        registeredOn: m.registeredOn,
      })),
      loans: organised.currentPortfolio.map((row) => ({
        sourceCustomerId: row.sourceId,
        principal: row.principal,
        totalReturn: row.totalReturn,
        balance: row.currentBalance,
        issuedOn: row.issuedOn,
        interestRatePercent: row.interestRatePercent,
        status: row.currentBalance > 0 ? "CURRENT" : "CLOSED",
      })),
      repayments: organised.repayments,
      capital: payload.capital,
      expenses: payload.expenditures,
      excessShortage: payload.excess,
      totals: organised.totals,
    },
  };

  for (const [name, value] of Object.entries(files)) {
    const dest = path.join(OUT_DIR, name);
    const body = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    await fs.writeFile(dest, body);
  }

  const latestRoot = path.join(ROOT, "data/coglim-export", `${SLUG}-latest.json`);
  await fs.writeFile(latestRoot, JSON.stringify(payload, null, 2));
  return files;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  try {
    await login(page);

    const dashboard = await scrapeDashboard(page);
    console.log("Dashboard:", dashboard);
    const profile = await scrapeProfile(page);
    console.log("Profile:", profile.displayName, profile.email, profile.phone);

    console.log("Scraping members...");
    const memberRows = await scrapePagedTable(page, `${CLIENT}/member_list.php`, {
      label: "members",
      tableSelector: "#example1",
    });
    const members = memberRows.map((row) => ({
      id: row.id,
      systemNumber: row.cells[2] || null,
      name: row.cells[3] || null,
      phone: row.cells[4] || null,
      photoUrl: row.img || null,
    }));
    console.log(`Members found: ${members.length}`);

    const checkpointPath = path.join(OUT_DIR, "checkpoint-members.json");
    let enriched = [];
    try {
      const existing = JSON.parse(await fs.readFile(checkpointPath, "utf8"));
      if (Array.isArray(existing) && existing.length) {
        enriched = existing;
        console.log(`Loaded ${enriched.length} members from checkpoint`);
      }
    } catch {
      enriched = [];
    }

    const doneIds = new Set(enriched.map((m) => String(m.id)));
    for (let i = 0; i < members.length; i += 1) {
      const m = members[i];
      if (doneIds.has(String(m.id))) continue;
      process.stdout.write(`  enrich ${i + 1}/${members.length} id=${m.id} ${m.name}\r`);
      try {
        enriched.push(await enrichMember(page, m));
      } catch (err) {
        console.error(`\n  failed member ${m.id}:`, err.message);
        enriched.push({ ...m, error: err.message, details: { name: m.name, phone: m.phone }, statement: { events: [] } });
      }
      doneIds.add(String(m.id));
      if (enriched.length % 25 === 0) {
        await fs.writeFile(checkpointPath, JSON.stringify(enriched));
      }
      if (i % 15 === 14) await page.waitForTimeout(250);
    }
    await fs.writeFile(checkpointPath, JSON.stringify(enriched));
    console.log(`\nEnriched ${enriched.length} members`);

    console.log("Scraping issued-loan ledger...");
    const issuedTable = await scrapeStaticTable(page, "add_loan.php", (tables) =>
      tables.find((t) => t.headers.some((h) => /principal/i.test(h))),
    );
    const issuedLoans = tableToObjects(issuedTable, (row) => ({
      rowNumber: row.cells[0] || null,
      name: row.cells[1] || null,
      principal: parseMoney(row.cells[2]),
      amountToPay: parseMoney(row.cells[3]),
      balance: parseMoney(row.cells[4]),
      issueDate: parseDate(row.cells[5]),
      payDate: parseDate(row.cells[6]),
      sourceId: row.id,
    }));
    console.log(`  issued loans: ${issuedLoans.length}`);

    console.log("Scraping capital...");
    const capitalTable = await scrapeStaticTable(page, "add_capital.php");
    const capital = tableToObjects(capitalTable, (row) => ({
      rowNumber: row.cells[0] || null,
      amount: parseMoney(row.cells[1]),
      source: row.cells[2] || null,
      to: row.cells[3] || null,
      date: parseDate(row.cells[4]),
      method: row.cells[5] || null,
    }));
    console.log(`  capital rows: ${capital.length}`);

    console.log("Scraping expenditures...");
    const expTable = await scrapeStaticTable(page, "add_expenditure.php", (tables) =>
      tables.find((t) => t.headers.some((h) => /expenditure/i.test(h))),
    );
    const expenditures = tableToObjects(expTable, (row) => ({
      rowNumber: row.cells[0] || null,
      name: row.cells[1] || null,
      source: row.cells[2] || null,
      amount: parseMoney(row.cells[3]),
      date: parseDate(row.cells[4]),
      method: row.cells[5] || null,
    })).filter((r) => r.name || r.amount != null);
    console.log(`  expenditures: ${expenditures.length}`);

    console.log("Scraping expense categories...");
    const catTable = await scrapeStaticTable(page, "exp.php");
    const expenseCategories = tableToObjects(catTable, (row) => ({
      rowNumber: row.cells[0] || null,
      name: row.cells[1] || null,
      createdAt: row.cells[2] || null,
    }));
    console.log(`  categories: ${expenseCategories.length}`);

    console.log("Scraping excess / shortage...");
    const excessTable = await scrapeStaticTable(page, "excess.php");
    const excess = tableToObjects(excessTable, (row) => ({
      rowNumber: row.cells[0] || null,
      reason: row.cells[1] || null,
      amount: parseMoney(row.cells[2]),
      date: parseDate(row.cells[3]),
    }));
    console.log(`  excess/shortage: ${excess.length}`);

    console.log("Scraping officers...");
    const officerTable = await scrapeStaticTable(page, "add_officer.php");
    const officers = tableToObjects(officerTable, (row) => ({
      name: row.cells[0] || null,
    })).filter((o) => o.name && !/^name$/i.test(o.name));
    console.log(`  officers: ${officers.length}`);

    console.log("Scraping defaulters...");
    const defTable = await scrapeStaticTable(page, "month.php");
    const defaulters = tableToObjects(defTable, (row) => ({
      rowNumber: row.cells[0] || null,
      name: row.cells[1] || null,
      dateOfLoan: parseDate(row.cells[2]),
      amountToPay: parseMoney(row.cells[3]),
      balance: parseMoney(row.cells[4]),
      lastPaymentOn: parseDate(row.cells[5]),
      phone: row.cells[6] || null,
    }));
    console.log(`  defaulters: ${defaulters.length}`);

    console.log("Scraping current positions (edit transaction)...");
    const positionRows = await scrapePagedTable(page, `${CLIENT}/edit_transac.php`, {
      label: "positions",
      maxPages: 80,
    });
    const currentPositions = positionRows.map((row) => ({
      rowNumber: row.cells[0] || null,
      member: row.cells[1] || null,
      totalReturn: parseMoney(row.cells[2]),
      amountPaid: parseMoney(row.cells[3]),
      balance: parseMoney(row.cells[4]),
      lastPayDate: parseDate(row.cells[5]),
      method: row.cells[6] || null,
    }));
    console.log(`  current positions: ${currentPositions.length}`);

    const transactions = await scrapeTransactions(page);
    console.log(`  transactions: ${transactions.length}`);

    const organised = buildOrganised({
      members: enriched,
      defaulters,
      capital,
      expenditures,
      excess,
      transactions,
      officers,
      issuedLoans,
    });

    const payload = {
      exportedAt: new Date().toISOString(),
      source: BASE,
      branch: {
        office: OFFICE,
        name: BRANCH_LABEL,
        organisation: "Cognate Investment Limited",
      },
      dashboard,
      profile,
      members: enriched,
      issuedLoans,
      capital,
      expenditures,
      expenseCategories,
      excess,
      officers,
      defaulters,
      currentPositions,
      transactions,
      organised,
    };

    await writeOutputs(payload);
    console.log("\nExport complete:", OUT_DIR);
    console.log(JSON.stringify(organised.totals, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
