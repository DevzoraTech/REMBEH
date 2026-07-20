import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import JSZip from 'jszip';
import {
  fillLoanAgreementDocx,
  replaceMergeFieldsInXml,
  resolveLoanAgreementTemplatePath,
} from './loan-agreement-docx.merger';
import { buildLoanAgreementMergeFields } from './loan-agreement-fields';

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

  it('fills the real DOCX template without leaving merge tokens', async () => {
    const templatePath = resolveLoanAgreementTemplatePath();
    const fields = buildLoanAgreementMergeFields({
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

    const filled = await fillLoanAgreementDocx(fields, templatePath);
    const zip = await JSZip.loadAsync(filled);
    const xml = await zip.file('word/document.xml')!.async('string');

    expect(xml).toContain('REMBEH Microfinance');
    expect(xml).toContain('Jane Doe');
    expect(xml).toContain('CF1234567890');
    expect(xml).toContain('Business stock');
    expect(xml).not.toMatch(/&lt;&lt;[A-Za-z0-9_]+&gt;&gt;/);
  });

  it('ships a runtime template under services/api/assets', async () => {
    const assetPath = join(process.cwd(), 'assets', 'loan-agreement.docx');
    const bytes = await readFile(assetPath);
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });
});
