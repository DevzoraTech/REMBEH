import { chromium } from "playwright";
const BASE = "https://www.coglim.com/cognate";
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
await page.goto(`${BASE}/Admin/`, { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  const sel = document.querySelector("#saved");
  if (sel) { sel.value = "ISHONGORORO"; sel.dispatchEvent(new Event("change", { bubbles: true })); }
});
await page.locator('input[name="username"]').fill("sam");
await page.locator('input[name="password"]').fill("perform");
await page.getByRole("button", { name: /sign in/i }).click();
await page.waitForURL(/dashboard\.php/);

const dashSrc = await page.evaluate(async () => (await fetch("dashboard.php")).text());
const hits = [...dashSrc.matchAll(/cash|closing|opening|balance|vault|float|hand/gi)].slice(0, 40).map((m) => {
  const i = m.index;
  return dashSrc.slice(Math.max(0, i - 80), i + 80).replace(/\s+/g, " ");
});
console.log("dashboard hits", hits);

await page.goto(`${BASE}/client/add_loan.php`, { waitUntil: "domcontentloaded" });
const loanText = await page.evaluate(() => {
  const clean = (t) => (t || "").replace(/\s+/g, " ").trim();
  return {
    totals: [...document.querySelectorAll("input,h3,h4,strong")].map((el) => ({
      tag: el.tagName, name: el.name, value: el.value, text: clean(el.textContent).slice(0, 80),
    })).filter((x) => /total|balance|cash|capital|amount/i.test(`${x.name} ${x.value} ${x.text}`)).slice(0, 20),
    snippet: clean(document.body.innerText).slice(0, 800),
  };
});
console.log("loan page", JSON.stringify(loanText, null, 2).slice(0, 2500));

await page.goto(`${BASE}/client/add_expenditure.php`, { waitUntil: "domcontentloaded" });
await page.locator("text=/Expenditure Reports/i").first().click();
await page.waitForTimeout(500);
if (await page.locator('input[name="date"]').count()) {
  await page.locator('input[name="date"]').first().fill("2026-09-01");
  await page.locator('input[name="date2"]').first().fill("2026-09-01");
  await Promise.all([
    page.waitForNavigation({ timeout: 30000 }).catch(() => {}),
    page.locator('button[name="update"], button:has-text("Submit")').first().click(),
  ]);
  console.log("report url", page.url());
  const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 2500));
  console.log(text);
}
await browser.close();
