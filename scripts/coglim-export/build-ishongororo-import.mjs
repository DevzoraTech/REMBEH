/**
 * Build a compact Rembeh import pack from the Ishongororo Coglim export.
 */
import fs from "node:fs/promises";
import path from "node:path";

const DIR = path.resolve("/Users/tukivusystemsltd/ANTIKRA/rembeh/data/coglim-export/ishongororo");
const SRC = path.join(DIR, "ishongororo-latest.json");
const OUT = path.join(DIR, "ishongororo-import.json");

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
function nameKey(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
function toIsoDate(value) {
  if (!value) return null;
  const v = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function normalizeUgPhone(raw, sourceId) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return { phone: `+256700${String(sourceId).padStart(7, "0").slice(-7)}`, placeholder: true };
  let national = digits;
  if (national.startsWith("256")) national = national.slice(3);
  if (national.startsWith("0")) national = national.slice(1);
  if (national.length === 9 && national.startsWith("7")) {
    return { phone: `+256${national}`, placeholder: false };
  }
  if (national.length >= 8 && national.length <= 10) {
    return { phone: `+256${national.slice(-9)}`, placeholder: false };
  }
  return { phone: `+256700${String(sourceId).padStart(7, "0").slice(-7)}`, placeholder: true };
}

const payload = JSON.parse(await fs.readFile(SRC, "utf8"));
const members = payload.organised.members;
const official = payload.organised.currentPortfolio;
const officialByCustomer = new Map();
for (const row of official) {
  const key = String(row.sourceId);
  const list = officialByCustomer.get(key) || [];
  list.push(row);
  officialByCustomer.set(key, list);
}

const customers = [];
const loans = [];
const phoneOwners = new Map();
let placeholderPhones = 0;
let duplicatePhones = 0;

for (const member of members) {
  const sourceId = String(member.sourceId);
  const phoneInfo = normalizeUgPhone(member.phone, sourceId);
  let phone = phoneInfo.phone;
  if (phoneOwners.has(phone)) {
    duplicatePhones += 1;
    phone = `+2568${String(sourceId).padStart(8, "0").slice(-8)}`;
    phoneInfo.placeholder = true;
  }
  phoneOwners.set(phone, sourceId);
  if (phoneInfo.placeholder) placeholderPhones += 1;

  customers.push({
    sourceId,
    systemNumber: member.systemNumber || `CIL${sourceId}`,
    fullName: member.name,
    phone,
    phonePlaceholder: phoneInfo.placeholder,
    registeredOn: toIsoDate(member.registeredOn),
    isActiveBorrower: Boolean(member.isActiveBorrower),
    isDefaulter: Boolean(member.isDefaulter),
  });

  const officialLoans = [...(officialByCustomer.get(String(member.sourceId)) || [])];
  const officialByCycle = new Map();
  const usedOfficial = new Set();
  const cycles = member.loans || [];
  const takeOfficial = (predicate) => {
    const found = officialLoans.find((row, i) => !usedOfficial.has(i) && predicate(row));
    if (!found) return null;
    usedOfficial.add(officialLoans.indexOf(found));
    return found;
  };
  for (const [index, cycle] of cycles.entries()) {
    const issuedOn = toIsoDate(cycle.issuedOn);
    const principal = cycle.principal != null ? round2(cycle.principal) : null;
    const match =
      takeOfficial(
        (row) =>
          row.issuedOn &&
          issuedOn === row.issuedOn &&
          principal != null &&
          Math.abs(row.principal - principal) < 0.01,
      ) ||
      takeOfficial(
        (row) => principal != null && Math.abs(row.principal - principal) < 0.01,
      );
    if (match) officialByCycle.set(index, match);
  }
  for (const [index, cycle] of cycles.entries()) {
    if (officialByCycle.has(index)) continue;
    if ((cycle.currentBalance || 0) <= 0) continue;
    const leftover = takeOfficial(() => true);
    if (leftover) officialByCycle.set(index, leftover);
  }

  for (const [index, cycle] of (member.loans || []).entries()) {
    const issuedOn = toIsoDate(cycle.issuedOn);
    const principal = cycle.principal != null ? round2(cycle.principal) : null;
    const totalReturn = cycle.totalReturn != null ? round2(cycle.totalReturn) : null;
    const cycleBalance = cycle.currentBalance != null ? round2(cycle.currentBalance) : null;
    const officialLoan = officialByCycle.get(index) || null;
    const isOfficial = Boolean(officialLoan);

    const opening = isOfficial
      ? round2(officialLoan.totalReturn ?? totalReturn ?? principal ?? 0)
      : round2(totalReturn ?? ((principal ?? 0) + (cycle.amountPaid ?? 0) + Math.max(cycleBalance ?? 0, 0)));
    const balance = isOfficial ? round2(officialLoan.currentBalance) : 0;
    const status = isOfficial
      ? officialLoan.isDefaulter
        ? "IN_ARREARS"
        : "CURRENT"
      : "CLOSED";

    loans.push({
      sourceCustomerId: sourceId,
      sourceLoanKey: `cil-${sourceId}-${index + 1}-${issuedOn || "na"}-${principal || 0}`,
      coglimIssueId: isOfficial ? officialLoan.sourceLoanId || null : null,
      issuedOn,
      dueOn: toIsoDate(isOfficial ? officialLoan.dueOn : cycle.dueOn),
      principal: round2(isOfficial ? officialLoan.principal : principal ?? 0),
      totalReturn: opening,
      balance,
      interestRatePercent: isOfficial
        ? officialLoan.interestRatePercent
        : cycle.interestRatePercent,
      status,
      isOfficialCurrent: Boolean(isOfficial),
      isDefaulter: Boolean(isOfficial && officialLoan.isDefaulter),
      payments: (cycle.payments || [])
        .filter((p) => p.amount != null && p.amount !== 0)
        .map((p, payIndex) => ({
          paidOn: toIsoDate(p.paidOn),
          amount: round2(p.amount),
          balanceAfter: p.balanceAfter == null ? null : round2(p.balanceAfter),
          sourceKey: `cil-pay-${sourceId}-${index + 1}-${payIndex + 1}-${toIsoDate(p.paidOn) || "na"}-${round2(p.amount)}`,
        })),
    });
  }

  for (const [i, officialLoan] of officialLoans.entries()) {
    if (usedOfficial.has(i)) continue;
    loans.push({
      sourceCustomerId: sourceId,
      sourceLoanKey: `cil-${sourceId}-official-${officialLoan.sourceLoanId || officialLoan.issuedOn}`,
      coglimIssueId: officialLoan.sourceLoanId || null,
      issuedOn: toIsoDate(officialLoan.issuedOn),
      dueOn: toIsoDate(officialLoan.dueOn),
      principal: round2(officialLoan.principal),
      totalReturn: round2(officialLoan.totalReturn),
      balance: round2(officialLoan.currentBalance),
      interestRatePercent: officialLoan.interestRatePercent,
      status: officialLoan.isDefaulter ? "IN_ARREARS" : "CURRENT",
      isOfficialCurrent: true,
      isDefaulter: Boolean(officialLoan.isDefaulter),
      payments: [],
    });
  }
}

const pack = {
  source: "https://www.coglim.com/cognate",
  exportedAt: payload.exportedAt,
  tenantHints: ["Cognate", "Cognate Investment", "Cognate Investment Limited"],
  branchHints: ["Ishongororo", "ISHONGORORO", "Inshongororo", "inshongororo"],
  officersAudit: (payload.officers || []).map((o) => clean(o.name)).filter(Boolean),
  customers,
  loans,
  capital: (payload.capital || []).map((row, i) => ({
    sourceKey: `cil-cap-${toIsoDate(row.date) || i}-${round2(row.amount)}-${i + 1}`,
    amount: round2(row.amount),
    date: toIsoDate(row.date),
    method: row.method || null,
    source: row.source || null,
    to: row.to || null,
  })),
  expenses: (payload.expenditures || []).map((row, i) => ({
    sourceKey: `cil-exp-${toIsoDate(row.date) || i}-${round2(row.amount)}-${i + 1}`,
    name: row.name || "Expense",
    amount: round2(row.amount),
    date: toIsoDate(row.date),
    method: row.method || null,
    source: row.source || null,
  })),
  excess: (payload.excess || []).map((row, i) => ({
    sourceKey: `cil-xs-${toIsoDate(row.date) || i}-${round2(row.amount)}-${i + 1}`,
    reason: row.reason || "Excess/shortage",
    amount: round2(row.amount),
    date: toIsoDate(row.date),
  })),
  expected: {
    customers: customers.length,
    loanCycles: loans.length,
    officialOpen: loans.filter((l) => l.isOfficialCurrent).length,
    officialBalance: round2(loans.filter((l) => l.isOfficialCurrent).reduce((n, l) => n + l.balance, 0)),
    repayments: loans.reduce((n, l) => n + l.payments.length, 0),
    capital: payload.capital?.length || 0,
    expenses: payload.expenditures?.length || 0,
    excess: payload.excess?.length || 0,
    placeholderPhones,
    duplicatePhones,
  },
};

await fs.writeFile(OUT, JSON.stringify(pack));
console.log(JSON.stringify(pack.expected, null, 2));
console.log("wrote", OUT);
