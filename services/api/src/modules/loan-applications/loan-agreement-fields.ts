/**
 * Loan agreement DOCX merge-field map
 * Template: product-idea-assets/Loan-agreement .docx
 *          (runtime copy: services/api/assets/loan-agreement.docx)
 *
 * | Placeholder                 | System field                                      |
 * |----------------------------|---------------------------------------------------|
 * | <<day>> <<month>> <<year>> | Agreement date (generate time / submit)           |
 * | <<current_date>>           | Agreement date (footer; same as date label)       |
 * | <<company_name>>           | Tenant name                                       |
 * | <<company_address>>        | Branch address                                    |
 * | <<company_contact>>        | Branch phone                                      |
 * | <<borrowername>>           | Borrower full name                                |
 * | <<borrower_name>>          | Borrower full name (signature block)              |
 * | <<NIN>>                    | National ID                                       |
 * | <<borrower_address>>       | District / sub-county / parish / village          |
 * | <<borrower_contact>>       | Phone                                             |
 * | <<amount_borrowed>>        | Principal (UGX, formatted)                        |
 * | <<amount_borrowed_in_words>> | Principal in English words                      |
 * | <<loan_purpose>>           | loanPurpose, else collateralType                  |
 * | <<interest_rate>>          | Interest rate percent (e.g. 10%)                  |
 * | <<loan_duration>>          | Term label (e.g. 90 days)                         |
 * | <<date_loan_taken>>        | Disbursement / submittedAt                        |
 * | <<fine_amount>>            | Penalty fine amount (UGX)                         |
 * | <<fine_period>>            | Fine period (e.g. 1 day)                          |
 * | <<collateral_1>>           | Collateral type                                   |
 * | <<gurantor_name>>          | Guarantor name (DOCX spelling)                    |
 * | <<agent_name>>             | Officer display name                              |
 * | <<borrower_signature>>     | Inline PNG at template signature placeholder      |
 * | <<guarantor_signature>>    | Inline PNG at template signature placeholder      |
 * | <<agent_signature>>        | Inline PNG at template signature placeholder      |
 */

export type LoanAgreementMergeFields = Record<string, string>;

export type LoanAgreementFieldSource = {
  clientName: string;
  phone: string | null;
  nationalId: string | null;
  principalAmount: number | null;
  interestRatePercent: number | null;
  durationDays: number | null;
  loanDurationLabel?: string | null;
  collateralType: string | null;
  loanPurpose?: string | null;
  district: string | null;
  subCounty: string | null;
  parish: string | null;
  village: string | null;
  guarantorName: string | null;
  companyName?: string | null;
  companyAddress?: string | null;
  companyContact?: string | null;
  agentName?: string | null;
  agreementDate?: Date | null;
  dateLoanTaken?: Date | null;
  fineAmount?: number | null;
  finePeriodLabel?: string | null;
};

/** Cleared in DOCX; real PNGs are embedded at these placeholder locations. */
const SIGNATURE_PLACEHOLDER = '';

export function buildLoanAgreementMergeFields(
  input: LoanAgreementFieldSource,
): LoanAgreementMergeFields {
  const agreementDate = input.agreementDate ?? new Date();
  const day = String(agreementDate.getUTCDate());
  const month = agreementDate.toLocaleString('en-UG', {
    month: 'long',
    timeZone: 'UTC',
  });
  const year = String(agreementDate.getUTCFullYear());
  const borrowerName = input.clientName?.trim() || '—';
  const loanDuration =
    input.loanDurationLabel?.trim() ||
    (input.durationDays != null ? `${input.durationDays} days` : '—');
  const purpose =
    input.loanPurpose?.trim() ||
    input.collateralType?.trim() ||
    'the purpose agreed with the Lender';

  const dateLabel = formatDate(agreementDate);

  return {
    day,
    month,
    year,
    current_date: dateLabel,
    company_name: input.companyName?.trim() || 'REMBEH Lender',
    company_address: input.companyAddress?.trim() || '—',
    company_contact: input.companyContact?.trim() || '—',
    borrowername: borrowerName,
    borrower_name: borrowerName,
    NIN: input.nationalId?.trim() || '—',
    borrower_address:
      [input.district, input.subCounty, input.parish, input.village]
        .filter(Boolean)
        .join(', ') || '—',
    borrower_contact: input.phone?.trim() || '—',
    amount_borrowed: formatMoney(input.principalAmount),
    amount_borrowed_in_words: amountToWords(input.principalAmount),
    loan_purpose: purpose,
    interest_rate: formatPercent(input.interestRatePercent),
    loan_duration: loanDuration,
    date_loan_taken: formatDate(input.dateLoanTaken ?? agreementDate),
    fine_amount: formatMoney(input.fineAmount ?? null),
    fine_period: input.finePeriodLabel?.trim() || '—',
    collateral_1: input.collateralType?.trim() || '—',
    gurantor_name: input.guarantorName?.trim() || '—',
    agent_name: input.agentName?.trim() || '—',
    borrower_signature: SIGNATURE_PLACEHOLDER,
    guarantor_signature: SIGNATURE_PLACEHOLDER,
    agent_signature: SIGNATURE_PLACEHOLDER,
  };
}

export function formatMoney(value: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString('en-UG', { maximumFractionDigits: 0 });
}

export function formatPercent(value: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value}%`;
}

export function formatDate(value: Date) {
  return value.toLocaleDateString('en-UG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Best-effort English words for UGX amounts (supports up to billions). */
export function amountToWords(value: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  const n = Math.round(Math.abs(value));
  if (n === 0) return 'Zero Uganda Shillings Only';
  return `${numberToWords(n)} Uganda Shillings Only`;
}

function numberToWords(n: number): string {
  const ones = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];
  const tens = [
    '',
    '',
    'Twenty',
    'Thirty',
    'Forty',
    'Fifty',
    'Sixty',
    'Seventy',
    'Eighty',
    'Ninety',
  ];

  const chunk = (num: number): string => {
    if (num < 20) return ones[num]!;
    if (num < 100) {
      const t = Math.floor(num / 10);
      const o = num % 10;
      return o ? `${tens[t]} ${ones[o]}` : tens[t]!;
    }
    const h = Math.floor(num / 100);
    const rest = num % 100;
    return rest
      ? `${ones[h]} Hundred ${chunk(rest)}`
      : `${ones[h]} Hundred`;
  };

  if (n < 1000) return chunk(n);
  if (n < 1_000_000) {
    const thousands = Math.floor(n / 1000);
    const rest = n % 1000;
    return rest
      ? `${chunk(thousands)} Thousand ${chunk(rest)}`
      : `${chunk(thousands)} Thousand`;
  }
  if (n < 1_000_000_000) {
    const millions = Math.floor(n / 1_000_000);
    const rest = n % 1_000_000;
    const restWords = rest ? ` ${numberToWords(rest)}` : '';
    return `${chunk(millions)} Million${restWords}`;
  }
  const billions = Math.floor(n / 1_000_000_000);
  const rest = n % 1_000_000_000;
  const restWords = rest ? ` ${numberToWords(rest)}` : '';
  return `${chunk(billions)} Billion${restWords}`;
}
