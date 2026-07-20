import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import JSZip from 'jszip';
import type { LoanAgreementMergeFields } from './loan-agreement-fields';

const DOCUMENT_XML = 'word/document.xml';

/**
 * Resolves the Loan-agreement DOCX template path.
 * Prefers services/api/assets/loan-agreement.docx (WorkingDirectory), then repo asset.
 */
export function resolveLoanAgreementTemplatePath(): string {
  const fromEnv = process.env.LOAN_AGREEMENT_TEMPLATE_PATH?.trim();
  const candidates = [
    fromEnv,
    join(process.cwd(), 'assets', 'loan-agreement.docx'),
    join(process.cwd(), '..', '..', 'product-idea-assets', 'Loan-agreement .docx'),
    join(__dirname, '..', '..', '..', 'assets', 'loan-agreement.docx'),
    join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      '..',
      'product-idea-assets',
      'Loan-agreement .docx',
    ),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(
    'Loan agreement DOCX template not found. Expected services/api/assets/loan-agreement.docx or product-idea-assets/Loan-agreement .docx',
  );
}

export async function fillLoanAgreementDocx(
  fields: LoanAgreementMergeFields,
  templatePath = resolveLoanAgreementTemplatePath(),
): Promise<Buffer> {
  const templateBytes = await readFile(templatePath);
  const zip = await JSZip.loadAsync(templateBytes);
  const documentFile = zip.file(DOCUMENT_XML);
  if (!documentFile) {
    throw new Error(`DOCX missing ${DOCUMENT_XML}`);
  }

  const xml = await documentFile.async('string');
  const filledXml = replaceMergeFieldsInXml(xml, fields);
  zip.file(DOCUMENT_XML, filledXml);

  return Buffer.from(
    await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
    }),
  );
}

/**
 * Replaces <<key>> placeholders. Placeholders are expected in single w:t runs
 * (template is normalized). Values are XML-escaped.
 */
export function replaceMergeFieldsInXml(
  xml: string,
  fields: LoanAgreementMergeFields,
): string {
  let result = xml;
  for (const [key, value] of Object.entries(fields)) {
    const escaped = escapeXmlText(value);
    const patterns = [
      `&lt;&lt;${escapeRegex(key)}&gt;&gt;`,
      `&lt;&lt;${escapeRegex(key)}&gt;`,
      `&lt;${escapeRegex(key)}&gt;&gt;`,
    ];
    for (const pattern of patterns) {
      result = result.replace(new RegExp(pattern, 'g'), escaped);
    }
  }
  return result;
}

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
