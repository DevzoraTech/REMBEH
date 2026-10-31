import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ReleaseStorageService } from './release-storage.service';

jest.mock('@aws-sdk/client-s3', () => {
  const actual = jest.requireActual('@aws-sdk/client-s3');
  return { ...actual, S3Client: jest.fn() };
});
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://example.test/upload'),
}));

describe('ReleaseStorageService upload encryption', () => {
  const send = jest.fn().mockResolvedValue({});

  beforeEach(() => {
    jest.clearAllMocks();
    (S3Client as jest.Mock).mockImplementation(() => ({ send }));
  });

  function service(endpoint?: string) {
    const values: Record<string, string | undefined> = {
      S3_ENDPOINT: endpoint,
      S3_BUCKET: 'test-bucket',
    };
    return new ReleaseStorageService({
      get: (key: string) => values[key],
    } as ConfigService);
  }

  it.each([
    ['AWS S3', undefined, 'AES256'],
    ['S3-compatible storage', 'https://storage.example.test', undefined],
  ])('uses supported encryption for %s uploads', async (_name, endpoint, encryption) => {
    const storage = service(endpoint);
    await storage.uploadApk(Buffer.from('apk'), 'mobile', 'android', '1.0.0', 1);
    expect(send.mock.calls[0][0].input.ServerSideEncryption).toBe(encryption);

    await storage.getPresignedUploadUrl('mobile', 'android', '1.0.0', 1);
    const command = (getSignedUrl as jest.Mock).mock.calls[0][1];
    expect(command.input.ServerSideEncryption).toBe(encryption);
  });
});
