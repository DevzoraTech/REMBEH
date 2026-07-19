import { ConfigService } from '@nestjs/config';
import { ObjectStorageService } from './object-storage.service';

describe('ObjectStorageService key builders', () => {
  const service = new ObjectStorageService({
    get: () => undefined,
  } as unknown as ConfigService);

  it('builds hierarchical media keys', () => {
    const key = service.buildMediaObjectKey({
      tenantId: 'tenant-1',
      applicationId: 'app-1',
      mediaType: 'PASSPORT',
      extension: 'jpg',
    });
    expect(key).toMatch(
      /^tenants\/tenant-1\/loans\/app-1\/media\/passport\/[0-9a-f-]+\.jpg$/,
    );
  });

  it('builds signature asset folder keys', () => {
    const keys = service.buildSignatureObjectKeys({
      tenantId: 'tenant-1',
      applicationId: 'app-1',
      signerRole: 'APPLICANT',
    });
    expect(keys.signaturePngKey).toMatch(
      /^tenants\/tenant-1\/loans\/app-1\/signatures\/applicant\/[0-9a-f-]+\/signature\.png$/,
    );
    expect(keys.strokesJsonKey.endsWith('/strokes.json')).toBe(true);
    expect(keys.metadataJsonKey.endsWith('/metadata.json')).toBe(true);
    expect(keys.signaturePngKey.split('/').slice(0, -1).join('/')).toBe(
      keys.strokesJsonKey.split('/').slice(0, -1).join('/'),
    );
  });

  it('builds signed agreement document keys', () => {
    const key = service.buildSignedAgreementKey({
      tenantId: 'tenant-1',
      applicationId: 'app-1',
      version: 2,
    });
    expect(key).toBe(
      'tenants/tenant-1/loans/app-1/documents/SignedLoanAgreement-2.pdf',
    );
  });

  it('builds tenant meta under company prefix', () => {
    expect(service.buildTenantPrefix('tenant-1')).toBe('tenants/tenant-1/');
    expect(service.buildTenantCompanyMetaKey('tenant-1')).toBe(
      'tenants/tenant-1/meta/company.json',
    );
    expect(service.buildTenantProductConfigKey('tenant-1', 'rates.json')).toBe(
      'tenants/tenant-1/products/rates_json',
    );
  });
});
