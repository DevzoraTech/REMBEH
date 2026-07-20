import { createHash } from 'node:crypto';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

/**
 * Merge fields supported from product-idea-assets/Loan-agreement .docx:
 *
 * | Placeholder | Source |
 * |---|---|
 * | <<day>> <<month>> <<year>> | Agreement date (submit / signed) |
 * | <<company_name>> | Tenant / lender name |
 * | <<company_address>> | Branch address (or tenant country) |
 * | <<company_contact>> | Branch phone |
 * | <<borrowername>> / <<borrower_name>> | Borrower full name |
 * | <<NIN>> | National ID |
 * | <<borrower_address>> | District / sub-county / parish / village |
 * | <<borrower_contact>> | Phone |
 * | <<amount_borrowed>> | Principal (UGX) |
 * | <<amount_borrowed_in_words>> | Principal in words (best-effort) |
 * | <<loan_purpose>> | loanPurpose or collateralType |
 * | <<interest_rate>> | Interest rate % |
 * | <<loan_duration>> | Term description (e.g. 90 days) |
 * | <<date_loan_taken>> | Disbursement / submit date |
 * | <<fine_amount>> | Penalty fine amount (UGX) |
 * | <<fine_period>> | Fine period description |
 * | <<collateral_1>> | Collateral type |
 * | <<gurantor_name>> | Guarantor name (DOCX spelling) |
 * | <<agent_name>> | Officer name |
 * | <<borrower_signature>> / <<guarantor_signature>> / <<agent_signature>> | Embedded PNGs |
 */

export type SignedAgreementParty = {
  role: string;
  signerName: string;
  signedAt: string;
  /** PNG bytes for the signature image (optional if unavailable server-side). */
  signaturePng?: Uint8Array | null;
};

export type SignedAgreementInput = {
  applicationId: string;
  clientName: string;
  phone: string | null;
  nationalId: string | null;
  principalAmount: number | null;
  interestRatePercent: number | null;
  durationDays: number | null;
  loanDurationLabel?: string | null;
  processingFee: number | null;
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
  version: number;
  parties: SignedAgreementParty[];
};

export type SignedAgreementPdfResult = {
  pdfBytes: Uint8Array;
  contentHash: string;
};

/**
 * Builds a signed loan agreement PDF matching the DOCX merge-field structure
 * (pdf-lib; no native deps). Stored under tenants/{id}/loans/{id}/documents/.
 */
export async function buildSignedLoanAgreementPdf(
  input: SignedAgreementInput,
): Promise<SignedAgreementPdfResult> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595.28, 841.89]); // A4
  let y = 800;
  const left = 50;
  const maxWidth = 495;

  const ensureSpace = (needed: number) => {
    if (y < needed) {
      page = doc.addPage([595.28, 841.89]);
      y = 800;
    }
  };

  const drawWrapped = (
    text: string,
    size = 10,
    useBold = false,
    gap = 4,
  ) => {
    const activeFont = useBold ? bold : font;
    const lines = wrapText(text, activeFont, size, maxWidth);
    for (const line of lines) {
      ensureSpace(40);
      page.drawText(line, {
        x: left,
        y,
        size,
        font: activeFont,
        color: rgb(0.1, 0.12, 0.18),
      });
      y -= size + gap;
    }
  };

  const agreementDate = input.agreementDate ?? new Date();
  const day = String(agreementDate.getUTCDate());
  const month = agreementDate.toLocaleString('en-UG', {
    month: 'long',
    timeZone: 'UTC',
  });
  const year = String(agreementDate.getUTCFullYear());
  const companyName = input.companyName?.trim() || 'REMBEH Lender';
  const companyAddress = input.companyAddress?.trim() || '—';
  const companyContact = input.companyContact?.trim() || '—';
  const borrowerName = input.clientName?.trim() || '—';
  const nin = input.nationalId?.trim() || '—';
  const borrowerAddress =
    [input.district, input.subCounty, input.parish, input.village]
      .filter(Boolean)
      .join(', ') || '—';
  const borrowerContact = input.phone?.trim() || '—';
  const amount = formatMoney(input.principalAmount);
  const amountWords = amountToWords(input.principalAmount);
  const purpose =
    input.loanPurpose?.trim() ||
    input.collateralType?.trim() ||
    'the purpose agreed with the Lender';
  const interestRate = formatPercent(input.interestRatePercent);
  const loanDuration =
    input.loanDurationLabel?.trim() ||
    (input.durationDays != null ? `${input.durationDays} days` : '—');
  const dateTaken = formatDate(input.dateLoanTaken ?? agreementDate);
  const fineAmount = formatMoney(input.fineAmount ?? null);
  const finePeriod = input.finePeriodLabel?.trim() || '—';
  const collateral = input.collateralType?.trim() || '—';
  const guarantor = input.guarantorName?.trim() || '—';
  const agentName = input.agentName?.trim() || '—';

  drawWrapped('THE REPUBLIC OF UGANDA', 12, true, 6);
  drawWrapped('IN THE MATTER OF THE MONEYLENDERS ACT, CAP.273', 10, true, 4);
  drawWrapped(`AND IN THE MATTER OF ${companyName.toUpperCase()}`, 10, true, 4);
  y -= 4;
  drawWrapped('LOAN AGREEMENT', 16, true, 10);
  drawWrapped(
    `This loan agreement made this ${day} day of ${month}, ${year}`,
    10,
  );
  y -= 4;
  drawWrapped('BETWEEN', 10, true);
  drawWrapped(
    `${companyName}, ${companyAddress}, ${companyContact} (hereafter referred to as "The Lender") of the one part`,
  );
  drawWrapped('AND', 10, true);
  drawWrapped(
    `${borrowerName}, ${nin} Of Residential address ${borrowerAddress} Telephone Number(s) ${borrowerContact} (Hereafter referred as "The Borrower") of the other part.`,
  );
  y -= 4;
  drawWrapped(
    `WHEREAS The Borrower has applied to The Lender for a loan in the sum of UGX ${amount} and`,
  );
  drawWrapped('NOW THEREFORE, this agreement witness as follows:', 10, true);
  y -= 4;

  drawWrapped('1. THE LOAN', 11, true);
  drawWrapped(
    `The Lender hereby agrees to loan The Borrower the sum of Ug. Shs ${amountWords}.`,
  );

  drawWrapped('2. THE PURPOSE OF THE LOAN', 11, true);
  drawWrapped(
    `The Borrower shall apply the loan towards ${purpose}.`,
  );

  drawWrapped('3. INTEREST', 11, true);
  drawWrapped(
    `An interest of ${interestRate} of the borrowed amount will be paid on top of the loaned amount at the end of the loan period.`,
  );

  drawWrapped('4. REPAYMENT', 11, true);
  drawWrapped(
    `a) The Borrower hereby agrees and undertakes to repay the said loan and interest within only ${loanDuration} from ${dateTaken} (the date of disbursement of the said loan), unless decided and agreed otherwise by the loans committee.`,
  );
  drawWrapped(
    `b) The Borrower hereby agrees that if the said loan is not paid within the AGREED loan period, an amount of UGX. ${fineAmount} will be charged for EVERY additional ${finePeriod} beyond the agreed loan period.`,
  );

  drawWrapped('5. SECURITY', 11, true);
  drawWrapped(
    'i) As security for repayment of the said loan and interest, The Borrower hereby pledges to The Lender the following;',
  );
  drawWrapped(`a) ${collateral}`);
  drawWrapped(
    'ii) The Borrower hereby agrees that in case of default, The Lender shall take legal actions against The Borrower to recover all the amounts including the legal and other costs.',
  );
  y -= 8;

  drawWrapped(`Application ID: ${input.applicationId}`, 8);
  drawWrapped(`Document version: ${input.version}`, 8);
  y -= 10;

  for (const party of input.parties) {
    ensureSpace(140);
    const label =
      party.role === 'APPLICANT'
        ? 'The Borrower'
        : party.role === 'GUARANTOR'
          ? 'Guarantor'
          : `On Behalf of ${companyName}`;
    drawWrapped(label, 11, true);
    drawWrapped(`Name: ${party.signerName}`, 10);
    drawWrapped(`Signed at: ${party.signedAt}`, 9);
    y = await drawSignature(page, doc, party.signaturePng, left, y);
  }

  ensureSpace(40);
  drawWrapped(
    'By signing electronically, each party agrees this signature has the same legal effect as a handwritten signature on a paper agreement.',
    8,
  );
  drawWrapped('Generated by REMBEH electronic signature system.', 8);

  const pdfBytes = await doc.save();
  const contentHash = createHash('sha256').update(pdfBytes).digest('hex');
  return { pdfBytes, contentHash };
}

async function drawSignature(
  page: PDFPage,
  doc: PDFDocument,
  signaturePng: Uint8Array | null | undefined,
  left: number,
  y: number,
): Promise<number> {
  if (signaturePng && signaturePng.byteLength > 0) {
    try {
      const image = await doc.embedPng(signaturePng);
      const maxWidth = 220;
      const maxHeight = 70;
      const scale = Math.min(
        maxWidth / image.width,
        maxHeight / image.height,
        1,
      );
      const width = image.width * scale;
      const height = image.height * scale;
      page.drawImage(image, {
        x: left,
        y: y - height,
        width,
        height,
      });
      return y - height - 16;
    } catch {
      // fall through
    }
  }
  return y - 12;
}

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = words[0]!;
  for (let i = 1; i < words.length; i += 1) {
    const next = `${current} ${words[i]}`;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
    } else {
      lines.push(current);
      current = words[i]!;
    }
  }
  lines.push(current);
  return lines;
}

function formatMoney(value: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString('en-UG', { maximumFractionDigits: 0 });
}

function formatPercent(value: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value}%`;
}

function formatDate(value: Date) {
  return value.toLocaleDateString('en-UG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Best-effort English words for UGX amounts (supports up to billions). */
function amountToWords(value: number | null): string {
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
