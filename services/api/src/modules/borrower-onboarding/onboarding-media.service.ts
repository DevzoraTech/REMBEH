import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LoanApplicationMediaType } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { PrismaService } from '../../database/prisma.service';
import { ObjectStorageService } from '../storage/object-storage.service';

const mediaTypes = new Set(['PASSPORT', 'NIN_FRONT', 'NIN_BACK', 'GUARANTOR_NIN_FRONT', 'GUARANTOR_NIN_BACK', 'COLLATERAL_DOC', 'SUPPORTING_DOC', 'OTHER_DOC']);
const mimeExtensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' };

function matchesFileSignature(bytes: Buffer, mimeType: string) {
  const signature = mimeType === 'image/jpeg' ? [0xff, 0xd8, 0xff]
    : mimeType === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10]
      : [0x25, 0x50, 0x44, 0x46, 0x2d];
  return bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte);
}

@Injectable()
export class OnboardingMediaService {
  constructor(private readonly prisma: PrismaService, private readonly storage: ObjectStorageService) {}

  async prepare(user: AuthenticatedUser, loanId: string, body: unknown) {
    if (!user.branchId) throw new ForbiddenException('A branch assignment is required.');
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Invalid attachment.');
    const { mediaType, mimeType, byteSize, fileName, ...extra } = body as Record<string, unknown>;
    if (Object.keys(extra).length || typeof mediaType !== 'string' || !mediaTypes.has(mediaType) || typeof mimeType !== 'string' || !mimeExtensions[mimeType] || !Number.isInteger(byteSize) || (byteSize as number) < 1 || (byteSize as number) > 10 * 1024 * 1024 || (fileName !== undefined && (typeof fileName !== 'string' || fileName.length > 255 || /[\x00-\x1f\x7f]/.test(fileName)))) throw new BadRequestException('Select a JPEG, PNG or PDF file up to 10 MB.');
    const scope = { tenantId: user.tenantId, branchId: user.branchId, loanId };
    const receipt = await this.prisma.borrowerOnboardingReceipt.findFirst({ where: scope });
    if (!receipt) throw new NotFoundException('Onboarding record not found.');
    const application = await this.prisma.loanApplication.findFirst({ where: { tenantId: user.tenantId, branchId: user.branchId, loanId, isOpeningMigration: true }, select: { id: true } });
    if (!application) throw new NotFoundException('Onboarding application not found.');
    const storageKey = this.storage.buildObjectKey({ tenantId: user.tenantId, branchId: user.branchId, applicationId: application.id, mediaType, extension: mimeExtensions[mimeType] });
    const signed = await this.storage.presignPut({ storageKey, mimeType, expiresInSeconds: 900 });
    const upload = await this.prisma.borrowerOnboardingUpload.create({ data: { ...scope, applicationId: application.id, mediaType, storageKey, mimeType, byteSize: byteSize as number, fileName: fileName as string | undefined, expiresAt: new Date(Date.now() + 900_000) } });
    return { uploadId: upload.id, uploadUrl: signed.uploadUrl, expiresInSeconds: signed.expiresInSeconds };
  }

  async confirm(user: AuthenticatedUser, loanId: string, uploadId: string) {
    if (!user.branchId) throw new ForbiddenException('A branch assignment is required.');
    const scope = { tenantId: user.tenantId, branchId: user.branchId, loanId, id: uploadId };
    const upload = await this.prisma.borrowerOnboardingUpload.findFirst({ where: scope });
    if (!upload) throw new NotFoundException('Attachment upload not found.');
    if (upload.confirmedAt) return { confirmed: true };
    if (Date.now() > upload.expiresAt.getTime() + 24 * 60 * 60 * 1000) throw new ConflictException('Upload expired. Select the file again.');
    let object: Awaited<ReturnType<ObjectStorageService['inspectObject']>>;
    try { object = await this.storage.inspectObject(upload.storageKey); } catch { throw new BadRequestException('The uploaded file could not be verified.'); }
    if (object.byteSize !== upload.byteSize || object.mimeType !== upload.mimeType || !object.etag) throw new BadRequestException('Uploaded file does not match the selected file.');
    let prefix: Buffer;
    try { prefix = await this.storage.readObjectPrefix(upload.storageKey, 8); } catch { throw new BadRequestException('The uploaded file could not be verified.'); }
    if (!matchesFileSignature(prefix, upload.mimeType)) throw new BadRequestException('Uploaded file contents do not match its type.');
    const finalKey = this.storage.buildObjectKey({ tenantId: upload.tenantId, branchId: upload.branchId, applicationId: upload.applicationId, mediaType: upload.mediaType, extension: mimeExtensions[upload.mimeType] });
    try {
      await this.storage.copyObjectIfUnchanged(upload.storageKey, finalKey, object.etag);
      const copied = await this.storage.inspectObject(finalKey);
      if (copied.byteSize !== upload.byteSize || copied.mimeType !== upload.mimeType) throw new Error('Copied object metadata differs.');
    } catch { throw new BadRequestException('The uploaded file changed or could not be verified.'); }
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM loan_applications WHERE id = ${upload.applicationId}::uuid FOR UPDATE`;
      const current = await tx.borrowerOnboardingUpload.findFirst({ where: scope });
      if (!current) throw new NotFoundException('Attachment upload not found.');
      if (current.confirmedAt) return;
      const newer = await tx.borrowerOnboardingUpload.findFirst({ where: { tenantId: user.tenantId, branchId: user.branchId!, applicationId: upload.applicationId, mediaType: upload.mediaType, confirmedAt: { not: null }, createdAt: { gt: upload.createdAt } } });
      if (newer) throw new ConflictException('A newer attachment has already been saved.');
      const data = { storageKey: finalKey, mimeType: upload.mimeType, byteSize: upload.byteSize, fileName: upload.fileName };
      await tx.loanApplicationMedia.upsert({ where: { loanApplicationId_type: { loanApplicationId: upload.applicationId, type: upload.mediaType as LoanApplicationMediaType } }, create: { loanApplicationId: upload.applicationId, type: upload.mediaType as LoanApplicationMediaType, ...data }, update: data });
      await tx.borrowerOnboardingUpload.update({ where: { id: upload.id }, data: { confirmedAt: new Date() } });
      await tx.auditLog.create({ data: { tenantId: user.tenantId, actorUserId: user.userId, action: 'borrower_onboarding.attachment_added', entityType: 'loan', entityId: loanId, newValue: { uploadId, mediaType: upload.mediaType } } });
    });
    return { confirmed: true };
  }
}
