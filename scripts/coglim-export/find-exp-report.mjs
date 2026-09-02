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

const html = await page.evaluate(async () => {
  const body = new URLSearchParams({ date: "2026-09-01", date2: "2026-09-01", supplier: "", update: "" }).toString();
  const res = await fetch("reports/cre_rpt.php", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  return { status: res.status, url: res.url, text: await res.text() };
});
console.log("cre_rpt", html.status, html.url, html.text.slice(0, 3000));

await page.goto(`${BASE}/client/add_expenditure.php`, { waitUntil: "domcontentloaded" });
const reportLink = await page.evaluate(() => {
  return [...document.querySelectorAll("a")].map((a) => ({ t: a.textContent.trim(), h: a.href })).filter((x) => /report/i.test(x.t+x.h));
});
console.log("report links", reportLink);

await page.locator("text=/Expenditure Reports/i").first().click().catch(() => {});
await page.waitForTimeout(800);
console.log("after click", page.url());
const modal = await page.evaluate(() => document.body.innerText.slice(0, 2500));
console.log(modal.slice(0, 1500));
await browser.close();
