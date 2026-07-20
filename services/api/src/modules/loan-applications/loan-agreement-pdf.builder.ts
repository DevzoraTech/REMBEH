import { createHash } from 'node:crypto';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { convertDocxToPdfWithLibreOffice } from './loan-agreement-docx-to-pdf';
import { fillLoanAgreementDocx } from './loan-agreement-docx.merger';
import {
  buildLoanAgreementMergeFields,
  type LoanAgreementFieldSource,
} from './loan-agreement-fields';

/**
 * Builds the signed loan agreement PDF from product-idea-assets/Loan-agreement .docx:
 * 1) Fill <<merge fields>> in the DOCX template
 * 2) Convert filled DOCX → PDF via LibreOffice when available
 * 3) Append electronic signature images
 *
 * Field mapping: see loan-agreement-fields.ts and docs/loan-agreement-fields.md
 */

export type SignedAgreementParty = {
  role: string;
  signerName: string;
  signedAt: string;
  /** PNG bytes for the signature image (optional if unavailable server-side). */
  signaturePng?: Uint8Array | null;
};

export type SignedAgreementInput = LoanAgreementFieldSource & {
  applicationId: string;
  processingFee: number | null;
  version: number;
  parties: SignedAgreementParty[];
};

export type SignedAgreementPdfResult = {
  pdfBytes: Uint8Array;
  contentHash: string;
  /** How the PDF body was produced (signatures always appended via pdf-lib). */
  source: 'docx-libreoffice' | 'docx-fields-fallback';
};

export async function buildSignedLoanAgreementPdf(
  input: SignedAgreementInput,
): Promise<SignedAgreementPdfResult> {
  const fields = buildLoanAgreementMergeFields(input);
  const filledDocx = await fillLoanAgreementDocx(fields);

  let bodyPdf: Uint8Array | null = await convertDocxToPdfWithLibreOffice(
    filledDocx,
  );
  let source: SignedAgreementPdfResult['source'] = 'docx-libreoffice';

  if (!bodyPdf) {
    source = 'docx-fields-fallback';
    bodyPdf = await buildFallbackPdfFromTemplateFields(input, fields);
  }

  const withSignatures = await appendSignaturePages(bodyPdf, input);
  const contentHash = createHash('sha256')
    .update(withSignatures)
    .digest('hex');

  return { pdfBytes: withSignatures, contentHash, source };
}

async function appendSignaturePages(
  bodyPdf: Uint8Array,
  input: SignedAgreementInput,
): Promise<Uint8Array> {
  if (input.parties.length === 0) return bodyPdf;

  const doc = await PDFDocument.load(bodyPdf);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595.28, 841.89]);
  let y = 800;
  const left = 50;
  const companyName = input.companyName?.trim() || 'REMBEH Lender';

  const draw = (text: string, size = 10, useBold = false) => {
    const active = useBold ? bold : font;
    page.drawText(text.slice(0, 110), {
      x: left,
      y,
      size,
      font: active,
      color: rgb(0.1, 0.12, 0.18),
    });
    y -= size + 6;
  };

  draw('ELECTRONIC SIGNATURES', 14, true);
  draw(`Application ID: ${input.applicationId}`, 9);
  draw(`Document version: ${input.version}`, 9);
  y -= 8;

  for (const party of input.parties) {
    if (y < 140) {
      page = doc.addPage([595.28, 841.89]);
      y = 800;
    }
    const label =
      party.role === 'APPLICANT'
        ? 'The Borrower'
        : party.role === 'GUARANTOR'
          ? 'Guarantor'
          : `On Behalf of ${companyName}`;
    draw(label, 11, true);
    draw(`Name: ${party.signerName}`, 10);
    draw(`Signed at: ${party.signedAt}`, 9);
    y = await drawSignature(page, doc, party.signaturePng, left, y);
    y -= 10;
  }

  draw(
    'By signing electronically, each party agrees this signature has the same legal effect as a handwritten signature.',
    8,
  );

  return doc.save();
}

/**
 * Fallback when LibreOffice is unavailable: render the same clauses/fields as the
 * DOCX template (not a sparse custom layout). Prefer installing LibreOffice in prod.
 */
async function buildFallbackPdfFromTemplateFields(
  input: SignedAgreementInput,
  fields: Record<string, string>,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  let page = doc.addPage([595.28, 841.89]);
  let y = 800;
  const left = 50;
  const maxWidth = 495;

  const ensureSpace = (needed: number) => {
    if (y < needed) {
      page = doc.addPage([595.28, 841.89]);
      y = 800;
    }
  };

  const drawWrapped = (text: string, size = 11, useBold = false, gap = 4) => {
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

  drawWrapped('THE REPUBLIC OF UGANDA', 12, true, 6);
  drawWrapped('IN THE MATTER OF THE MONEYLENDERS ACT, CAP.273', 10, true, 4);
  drawWrapped(
    `AND IN THE MATTER OF ${fields.company_name.toUpperCase()}`,
    10,
    true,
    4,
  );
  y -= 4;
  drawWrapped('LOAN AGREEMENT', 16, true, 10);
  drawWrapped(
    `This loan agreement made this ${fields.day} day of ${fields.month}, ${fields.year}`,
    11,
  );
  y -= 4;
  drawWrapped('BETWEEN', 11, true);
  drawWrapped(
    `${fields.company_name}, ${fields.company_address}, ${fields.company_contact} (hereafter referred to as "The Lender") of the one part`,
  );
  drawWrapped('AND', 11, true);
  drawWrapped(
    `${fields.borrowername}, ${fields.NIN} Of Residential address ${fields.borrower_address} Telephone Number(s) ${fields.borrower_contact} (Hereafter referred as "The Borrower") of the other part.`,
  );
  y -= 4;
  drawWrapped(
    `WHEREAS The Borrower has applied to The Lender for a loan in the sum of UGX ${fields.amount_borrowed} and`,
  );
  drawWrapped('NOW THEREFORE, this agreement witness as follows:', 11, true);
  y -= 4;

  drawWrapped('1. THE LOAN', 12, true);
  drawWrapped(
    `The Lender hereby agrees to loan The Borrower the sum of Ug. Shs ${fields.amount_borrowed_in_words}.`,
  );

  drawWrapped('2. THE PURPOSE OF THE LOAN', 12, true);
  drawWrapped(
    `The Borrower shall apply the loan towards ${fields.loan_purpose}`,
  );

  drawWrapped('3. INTREST', 12, true);
  drawWrapped(
    `An interest of ${fields.interest_rate} of the borrowed amount will be paid on top of the loaned amount at the end of the loan period.`,
  );

  drawWrapped('4. REPAYMENT', 12, true);
  drawWrapped(
    `a) The Borrower hereby agrees and undertakes to repay the said loan and interest within only ${fields.loan_duration} from ${fields.date_loan_taken} (the date of disbursement of the said loan), unless decided and agreed otherwise by the loans committee.`,
  );
  drawWrapped(
    `b) The Borrower hereby agrees that if the said loan is not paid within the AGREED loan period, an amount of UGX. ${fields.fine_amount} will be charged for EVERY additional ${fields.fine_period} beyond the agreed loan period.`,
  );

  drawWrapped('5. SECURITY', 12, true);
  drawWrapped(
    'i) As security for repayment of the said loan and interest, The Borrower hereby pledges to The Lender the following;',
  );
  drawWrapped(`a) ${fields.collateral_1}`);
  drawWrapped(
    'ii) The Borrower hereby agrees that in case of default, The Lender shall take legal actions against The Borrower to recover all the amounts including the legal and other costs.',
  );
  y -= 8;

  drawWrapped('The Borrower', 11, true);
  drawWrapped(
    `Name: ${fields.borrower_name}              Signature: ${fields.borrower_signature}`,
  );
  drawWrapped('Guarantor', 11, true);
  drawWrapped(
    `Name: ${fields.gurantor_name}         Signature: ${fields.guarantor_signature}`,
  );
  drawWrapped(`On Behalf of ${fields.company_name}`, 11, true);
  drawWrapped(
    `Name: ${fields.agent_name}                 Signature: ${fields.agent_signature}`,
  );

  drawWrapped(`Application ID: ${input.applicationId}`, 8);
  drawWrapped(`Document version: ${input.version}`, 8);
  drawWrapped(
    'Generated from Loan-agreement DOCX template fields (LibreOffice PDF conversion unavailable).',
    8,
  );

  return doc.save();
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
