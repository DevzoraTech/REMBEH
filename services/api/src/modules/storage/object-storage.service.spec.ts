import { ConfigService } from '@nestjs/config';
import { ObjectStorageService } from './object-storage.service';

describe('ObjectStorageService key builders', () => {
  const service = new ObjectStorageService({
    get: () => undefined,
  } as unknown as ConfigService);

  it('builds organisation → branch → media type keys', () => {
    const key = service.buildMediaObjectKey({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      applicationId: 'app-1',
      mediaType: 'PASSPORT',
      extension: 'jpg',
    });
    expect(key).toMatch(
      /^tenants\/tenant-1\/branches\/branch-1\/media\/passport\/app-1\/[0-9a-f-]+\.jpg$/,
    );
  });

  it('builds organisation → branch → agent-profiles keys', () => {
    const key = service.buildAgentProfilePhotoKey({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      userId: 'user-1',
      extension: 'jpg',
    });
    expect(key).toMatch(
      /^tenants\/tenant-1\/branches\/branch-1\/agent-profiles\/user-1\/[0-9a-f-]+\.jpg$/,
    );
  });

  it('accepts modern and legacy agent profile prefixes', () => {
    expect(
      service.isAgentProfilePhotoKey({
        tenantId: 'tenant-1',
        userId: 'user-1',
        storageKey:
          'tenants/tenant-1/branches/branch-1/agent-profiles/user-1/abc.jpg',
      }),
    ).toBe(true);
    expect(
      service.isAgentProfilePhotoKey({
        tenantId: 'tenant-1',
        userId: 'user-1',
        storageKey: 'tenants/tenant-1/agents/user-1/profile/abc.jpg',
      }),
    ).toBe(true);
    expect(
      service.isAgentProfilePhotoKey({
        tenantId: 'tenant-1',
        userId: 'user-1',
        storageKey: 'tenants/tenant-1/branches/branch-1/media/passport/x.jpg',
      }),
    ).toBe(false);
  });

  it('builds organisation → branch → signatures keys', () => {
    const keys = service.buildSignatureObjectKeys({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      applicationId: 'app-1',
      signerRole: 'APPLICANT',
    });
    expect(keys.signaturePngKey).toMatch(
      /^tenants\/tenant-1\/branches\/branch-1\/signatures\/applicant\/app-1\/[0-9a-f-]+\/signature\.png$/,
    );
    expect(keys.strokesJsonKey.endsWith('/strokes.json')).toBe(true);
    expect(keys.metadataJsonKey.endsWith('/metadata.json')).toBe(true);
    expect(keys.signaturePngKey.split('/').slice(0, -1).join('/')).toBe(
      keys.strokesJsonKey.split('/').slice(0, -1).join('/'),
    );
  });

  it('builds organisation → branch → loan-agreements keys', () => {
    const key = service.buildSignedAgreementKey({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      applicationId: 'app-1',
      version: 2,
    });
    expect(key).toBe(
      'tenants/tenant-1/branches/branch-1/loan-agreements/app-1/SignedLoanAgreement-2.pdf',
    );
  });

  it('builds tenant meta under organisation prefix', () => {
    expect(service.buildTenantPrefix('tenant-1')).toBe('tenants/tenant-1/');
    expect(service.buildBranchPrefix('tenant-1', 'branch-1')).toBe(
      'tenants/tenant-1/branches/branch-1/',
    );
    expect(service.buildTenantCompanyMetaKey('tenant-1')).toBe(
      'tenants/tenant-1/meta/company.json',
    );
    expect(service.buildTenantProductConfigKey('tenant-1', 'rates.json')).toBe(
      'tenants/tenant-1/products/rates_json',
    );
  });
});
