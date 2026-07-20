import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import JSZip from 'jszip';
import {
  fillLoanAgreementDocx,
  fitSignatureEmu,
  readPngSize,
  replaceMergeFieldsInXml,
  resolveLoanAgreementTemplatePath,
} from './loan-agreement-docx.merger';
import { buildLoanAgreementMergeFields } from './loan-agreement-fields';

/** 1×1 PNG for embedding tests */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function sampleFields() {
  return buildLoanAgreementMergeFields({
    clientName: 'Jane Doe',
    phone: '+256700000000',
    nationalId: 'CF1234567890',
    principalAmount: 1_500_000,
    interestRatePercent: 10,
    durationDays: 90,
    loanDurationLabel: '90 days',
    collateralType: 'Motorcycle',
    loanPurpose: 'Business stock',
    district: 'Kampala',
    subCounty: 'Central',
    parish: 'Nakasero',
    village: 'Plot 1',
    guarantorName: 'John Guarantor',
    companyName: 'REMBEH Microfinance',
    companyAddress: 'Kampala Road',
    companyContact: '+256711111111',
    agentName: 'Agent Smith',
    agreementDate: new Date('2026-07-20T00:00:00.000Z'),
    dateLoanTaken: new Date('2026-07-20T00:00:00.000Z'),
    fineAmount: 15_000,
    finePeriodLabel: '1 day',
  });
}

describe('loan-agreement-docx.merger', () => {
  it('replaces entity-encoded <<placeholders>> in document XML', () => {
    const xml =
      '<w:t>&lt;&lt;company_name&gt;&gt;</w:t><w:t>&lt;&lt;NIN&gt;&gt;</w:t>';
    const out = replaceMergeFieldsInXml(xml, {
      company_name: 'Acme Ltd',
      NIN: 'CM123',
    });
    expect(out).toContain('Acme Ltd');
    expect(out).toContain('CM123');
    expect(out).not.toContain('company_name');
  });

  it('skips signature keys during text merge (handled by image embed)', () => {
    const xml = '<w:t>&lt;&lt;borrower_signature&gt;&gt;</w:t>';
    const out = replaceMergeFieldsInXml(xml, {
      borrower_signature: 'should-not-appear',
    });
    expect(out).toContain('&lt;&lt;borrower_signature&gt;&gt;');
    expect(out).not.toContain('should-not-appear');
  });

  it('fills the real DOCX template without leaving merge tokens', async () => {
    const templatePath = resolveLoanAgreementTemplatePath();
    const filled = await fillLoanAgreementDocx(sampleFields(), templatePath);
    const zip = await JSZip.loadAsync(filled);
    const xml = await zip.file('word/document.xml')!.async('string');

    expect(xml).toContain('REMBEH Microfinance');
    expect(xml).toContain('Jane Doe');
    expect(xml).toContain('CF1234567890');
    expect(xml).toContain('Business stock');
    expect(xml).not.toMatch(/&lt;&lt;[A-Za-z0-9_]+&gt;&gt;/);
  });

  it('embeds signature PNGs inline at template placeholders', async () => {
    const templatePath = resolveLoanAgreementTemplatePath();
    const filled = await fillLoanAgreementDocx(sampleFields(), templatePath, {
      borrower_signature: TINY_PNG,
      guarantor_signature: TINY_PNG,
      agent_signature: TINY_PNG,
    });

    const zip = await JSZip.loadAsync(filled);
    const xml = await zip.file('word/document.xml')!.async('string');
    const rels = await zip.file('word/_rels/document.xml.rels')!.async('string');
    const contentTypes = await zip.file('[Content_Types].xml')!.async('string');

    expect(xml).not.toMatch(/&lt;&lt;(borrower|guarantor|agent)_signature&gt;&gt;/);
    expect(xml).toContain('<w:drawing>');
    expect(xml).toContain('r:embed=');
    expect(rels).toContain(
      'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
    );
    expect(contentTypes).toMatch(/Extension="png"/i);
    expect(zip.file('word/media/signature_borrower_signature.png')).toBeTruthy();
    expect(zip.file('word/media/signature_guarantor_signature.png')).toBeTruthy();
    expect(zip.file('word/media/signature_agent_signature.png')).toBeTruthy();
    expect(xml).not.toContain('ELECTRONIC SIGNATURES');
  });

  it('reads PNG size and fits within signature EMU bounds', () => {
    const size = readPngSize(TINY_PNG);
    expect(size.width).toBe(1);
    expect(size.height).toBe(1);
    const fitted = fitSignatureEmu(800, 200);
    expect(fitted.cx).toBeLessThanOrEqual(2_011_680);
    expect(fitted.cy).toBeLessThanOrEqual(685_800);
  });

  it('ships a runtime template under services/api/assets', async () => {
    const assetPath = join(process.cwd(), 'assets', 'loan-agreement.docx');
    const bytes = await readFile(assetPath);
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });
});
