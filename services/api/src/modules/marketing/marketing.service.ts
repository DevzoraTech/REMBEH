import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MarketingCampaignAudience,
  MarketingCampaignMediaType,
  MarketingCampaignPlacement,
  MarketingCampaignStatus,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { PrismaService } from '../../database/prisma.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import type { ControlCenterAdminContext } from '../control-center/control-center-admin';
import {
  MarketingCampaignDto,
  MarketingCampaignStatusDto,
  MarketingMediaPresignDto,
  UpdateMarketingCampaignDto,
} from './dto/marketing-campaign.dto';
import type {
  MarketingCampaignContract,
  MarketingCampaignListContract,
  MobileMarketingCampaignResponseContract,
} from './marketing.contracts';

type CampaignWithRelations = Prisma.MarketingCampaignGetPayload<{
  include: {
    tenant: { select: { id: true; name: true } };
    branch: { select: { id: true; name: true } };
    createdBy: { select: { id: true; displayName: true; email: true } };
  };
}>;

@Injectable()
export class MarketingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly objectStorage: ObjectStorageService,
  ) {}

  async listControlCenterCampaigns(): Promise<MarketingCampaignListContract> {
    const campaigns = await this.prisma.marketingCampaign.findMany({
      include: this.campaignIncludes(),
      orderBy: [
        { status: 'asc' },
        { priority: 'desc' },
        { startsAt: 'desc' },
        { createdAt: 'desc' },
      ],
      take: 300,
    });

    return {
      stats: {
        total: campaigns.length,
        active: campaigns.filter(
          (campaign) => campaign.status === MarketingCampaignStatus.ACTIVE,
        ).length,
        draft: campaigns.filter(
          (campaign) => campaign.status === MarketingCampaignStatus.DRAFT,
        ).length,
        paused: campaigns.filter(
          (campaign) => campaign.status === MarketingCampaignStatus.PAUSED,
        ).length,
        archived: campaigns.filter(
          (campaign) => campaign.status === MarketingCampaignStatus.ARCHIVED,
        ).length,
      },
      campaigns: await Promise.all(
        campaigns.map((campaign) => this.toCampaignContract(campaign)),
      ),
    };
  }

  async createControlCenterCampaign(
    admin: ControlCenterAdminContext,
    dto: MarketingCampaignDto,
  ) {
    const data = await this.toCampaignCreateData(admin, dto);
    const campaign = await this.prisma.marketingCampaign.create({
      data,
      include: this.campaignIncludes(),
    });

    await this.audit(admin.adminId, 'control_center.marketing.created', {
      campaignId: campaign.id,
      title: campaign.title,
      audience: campaign.audience,
      status: campaign.status,
    });

    return { campaign: await this.toCampaignContract(campaign) };
  }

  async updateControlCenterCampaign(
    admin: ControlCenterAdminContext,
    campaignId: string,
    dto: UpdateMarketingCampaignDto,
  ) {
    const existing = await this.prisma.marketingCampaign.findUnique({
      where: { id: campaignId },
      include: this.campaignIncludes(),
    });
    if (!existing) {
      throw new NotFoundException('Marketing campaign not found.');
    }

    const data = await this.toCampaignUpdateData(existing, dto);
    const campaign = await this.prisma.marketingCampaign.update({
      where: { id: campaignId },
      data,
      include: this.campaignIncludes(),
    });

    await this.audit(admin.adminId, 'control_center.marketing.updated', {
      campaignId,
      oldStatus: existing.status,
      newStatus: campaign.status,
      title: campaign.title,
    });

    return { campaign: await this.toCampaignContract(campaign) };
  }

  async updateControlCenterCampaignStatus(
    admin: ControlCenterAdminContext,
    campaignId: string,
    dto: MarketingCampaignStatusDto,
  ) {
    const existing = await this.prisma.marketingCampaign.findUnique({
      where: { id: campaignId },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new NotFoundException('Marketing campaign not found.');
    }

    const campaign = await this.prisma.marketingCampaign.update({
      where: { id: campaignId },
      data: { status: dto.status },
      include: this.campaignIncludes(),
    });

    await this.audit(admin.adminId, 'control_center.marketing.status_updated', {
      campaignId,
      oldStatus: existing.status,
      newStatus: campaign.status,
    });

    return { campaign: await this.toCampaignContract(campaign) };
  }

  async presignControlCenterMedia(
    _admin: ControlCenterAdminContext,
    dto: MarketingMediaPresignDto,
  ) {
    const mimeType = dto.mimeType.trim().toLowerCase();
    const mediaType = this.mediaTypeFromMime(mimeType);
    if (mediaType === MarketingCampaignMediaType.NONE) {
      throw new BadRequestException('Choose an image or video file.');
    }

    const storageKey = this.buildCampaignMediaKey(dto.fileName, mimeType);
    const presigned = await this.objectStorage.presignPut({
      storageKey,
      mimeType,
      expiresInSeconds: 600,
    });

    return {
      ...presigned,
      mediaType,
    };
  }

  async mobileHeaderCampaign(
    user: AuthenticatedUser,
  ): Promise<MobileMarketingCampaignResponseContract> {
    if (!user.tenantId) {
      return { campaign: null };
    }

    const [userRow, campaigns] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: user.userId },
        select: {
          id: true,
          tenantId: true,
          branchId: true,
          roles: { select: { role: { select: { name: true } } } },
        },
      }),
      this.prisma.marketingCampaign.findMany({
        where: this.mobileCandidateWhere(user),
        include: this.campaignIncludes(),
        orderBy: [
          { priority: 'desc' },
          { startsAt: 'desc' },
          { createdAt: 'desc' },
        ],
        take: 25,
      }),
    ]);

    if (!userRow) {
      return { campaign: null };
    }

    const roleNames = userRow.roles.map((row) => row.role.name);
    const matching = campaigns.find((campaign) =>
      this.campaignMatchesUser(campaign, {
        userId: user.userId,
        tenantId: user.tenantId,
        branchId: user.branchId,
        roleNames,
      }),
    );

    if (!matching) {
      return { campaign: null };
    }

    const contract = await this.toCampaignContract(matching);
    return {
      campaign: {
        id: contract.id,
        title: contract.title,
        body: contract.body,
        ctaLabel: contract.ctaLabel,
        ctaUrl: contract.ctaUrl,
        mediaUrl: contract.mediaUrl,
        mediaType: contract.mediaType,
        priority: contract.priority,
        startsAt: contract.startsAt,
        endsAt: contract.endsAt,
      },
    };
  }

  private async toCampaignCreateData(
    admin: ControlCenterAdminContext,
    dto: MarketingCampaignDto,
  ): Promise<Prisma.MarketingCampaignCreateInput> {
    const normalized = this.normalizeCampaignInput(dto);
    await this.validateCampaignScope(normalized);

    return {
      title: normalized.title,
      body: normalized.body,
      ctaLabel: normalized.ctaLabel,
      ctaUrl: normalized.ctaUrl,
      mediaUrl: normalized.mediaUrl,
      mediaStorageKey: normalized.mediaStorageKey,
      mediaType: normalized.mediaType,
      placement: normalized.placement,
      audience: normalized.audience,
      status: normalized.status,
      tenant: normalized.tenantId
        ? { connect: { id: normalized.tenantId } }
        : undefined,
      branch: normalized.branchId
        ? { connect: { id: normalized.branchId } }
        : undefined,
      roleNames: normalized.roleNames,
      userIds: normalized.userIds,
      priority: normalized.priority,
      startsAt: normalized.startsAt,
      endsAt: normalized.endsAt,
      createdBy: { connect: { id: admin.adminId } },
    };
  }

  private async toCampaignUpdateData(
    existing: CampaignWithRelations,
    dto: UpdateMarketingCampaignDto,
  ): Promise<Prisma.MarketingCampaignUpdateInput> {
    const merged = this.normalizeCampaignInput({
      title: dto.title ?? existing.title,
      body: dto.body ?? existing.body,
      ctaLabel: dto.ctaLabel === undefined ? existing.ctaLabel : dto.ctaLabel,
      ctaUrl: dto.ctaUrl === undefined ? existing.ctaUrl : dto.ctaUrl,
      mediaUrl: dto.mediaUrl === undefined ? existing.mediaUrl : dto.mediaUrl,
      mediaStorageKey:
        dto.mediaStorageKey === undefined
          ? existing.mediaStorageKey
          : dto.mediaStorageKey,
      mediaType: dto.mediaType ?? existing.mediaType,
      placement: dto.placement ?? existing.placement,
      audience: dto.audience ?? existing.audience,
      status: dto.status ?? existing.status,
      tenantId: dto.tenantId === undefined ? existing.tenantId : dto.tenantId,
      branchId: dto.branchId === undefined ? existing.branchId : dto.branchId,
      roleNames: dto.roleNames ?? existing.roleNames,
      userIds: dto.userIds ?? existing.userIds,
      priority: dto.priority ?? existing.priority,
      startsAt: dto.startsAt ?? existing.startsAt.toISOString(),
      endsAt:
        dto.endsAt === undefined ? existing.endsAt?.toISOString() : dto.endsAt,
    });
    await this.validateCampaignScope(merged);

    return {
      title: merged.title,
      body: merged.body,
      ctaLabel: merged.ctaLabel,
      ctaUrl: merged.ctaUrl,
      mediaUrl: merged.mediaUrl,
      mediaStorageKey: merged.mediaStorageKey,
      mediaType: merged.mediaType,
      placement: merged.placement,
      audience: merged.audience,
      status: merged.status,
      tenant: merged.tenantId
        ? { connect: { id: merged.tenantId } }
        : { disconnect: true },
      branch: merged.branchId
        ? { connect: { id: merged.branchId } }
        : { disconnect: true },
      roleNames: { set: merged.roleNames },
      userIds: { set: merged.userIds },
      priority: merged.priority,
      startsAt: merged.startsAt,
      endsAt: merged.endsAt,
    };
  }

  private normalizeCampaignInput(
    dto: MarketingCampaignDto | RequiredCampaignInput,
  ) {
    const title = dto.title.trim();
    const body = dto.body.trim();
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : new Date();
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException('Choose a valid start date.');
    }
    if (endsAt && Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException('Choose a valid end date.');
    }
    if (endsAt && endsAt <= startsAt) {
      throw new BadRequestException('End date must be after start date.');
    }

    const mediaStorageKey = this.cleanNullable(dto.mediaStorageKey);
    const mediaUrl = mediaStorageKey ? null : this.cleanNullable(dto.mediaUrl);
    const mediaType =
      (dto.mediaType as MarketingCampaignMediaType | undefined) ??
      (mediaStorageKey || mediaUrl
        ? MarketingCampaignMediaType.IMAGE
        : MarketingCampaignMediaType.NONE);

    return {
      title,
      body,
      ctaLabel: this.cleanNullable(dto.ctaLabel),
      ctaUrl: this.cleanNullable(dto.ctaUrl),
      mediaUrl,
      mediaStorageKey,
      mediaType,
      placement:
        (dto.placement as MarketingCampaignPlacement | undefined) ??
        MarketingCampaignPlacement.MOBILE_HEADER,
      audience: dto.audience as MarketingCampaignAudience,
      status:
        (dto.status as MarketingCampaignStatus | undefined) ??
        MarketingCampaignStatus.DRAFT,
      tenantId: this.cleanNullable(dto.tenantId),
      branchId: this.cleanNullable(dto.branchId),
      roleNames: this.cleanList(dto.roleNames),
      userIds: this.cleanList(dto.userIds),
      priority: dto.priority ?? 0,
      startsAt,
      endsAt,
    };
  }

  private async validateCampaignScope(input: NormalizedCampaignInput) {
    if (!input.title || !input.body) {
      throw new BadRequestException('Add a title and message.');
    }
    if (
      input.audience === MarketingCampaignAudience.ALL_USERS &&
      (input.tenantId || input.branchId)
    ) {
      throw new BadRequestException(
        'All-user campaigns must not be limited to one organization or branch.',
      );
    }
    if (
      (input.audience === MarketingCampaignAudience.TENANT_USERS ||
        input.audience === MarketingCampaignAudience.BRANCH_USERS ||
        input.audience === MarketingCampaignAudience.TENANT_OWNERS) &&
      !input.tenantId
    ) {
      throw new BadRequestException(
        'Choose an organization for this audience.',
      );
    }
    if (
      input.audience === MarketingCampaignAudience.BRANCH_USERS &&
      !input.branchId
    ) {
      throw new BadRequestException('Choose a branch for this audience.');
    }
    if (
      input.audience === MarketingCampaignAudience.ROLE_USERS &&
      input.roleNames.length === 0
    ) {
      throw new BadRequestException('Choose at least one role.');
    }
    if (
      input.audience === MarketingCampaignAudience.SELECTED_USERS &&
      input.userIds.length === 0
    ) {
      throw new BadRequestException('Choose at least one user.');
    }
    if (input.branchId && !input.tenantId) {
      throw new BadRequestException('Branch campaigns need an organization.');
    }

    if (input.tenantId) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: input.tenantId },
        select: { id: true },
      });
      if (!tenant)
        throw new BadRequestException('Choose a valid organization.');
    }

    if (input.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: input.branchId, tenantId: input.tenantId ?? undefined },
        select: { id: true },
      });
      if (!branch) throw new BadRequestException('Choose a valid branch.');
    }

    if (input.userIds.length) {
      const users = await this.prisma.user.findMany({
        where: {
          id: { in: input.userIds },
          ...(input.tenantId ? { tenantId: input.tenantId } : {}),
          ...(input.branchId ? { branchId: input.branchId } : {}),
        },
        select: { id: true },
      });
      if (users.length !== input.userIds.length) {
        throw new BadRequestException(
          'One or more selected users are invalid.',
        );
      }
    }
  }

  private mobileCandidateWhere(
    user: AuthenticatedUser,
  ): Prisma.MarketingCampaignWhereInput {
    const now = new Date();
    const audienceScope: Prisma.MarketingCampaignWhereInput[] = [
      { audience: MarketingCampaignAudience.ALL_USERS },
      {
        audience: MarketingCampaignAudience.TENANT_USERS,
        tenantId: user.tenantId,
      },
      {
        audience: MarketingCampaignAudience.TENANT_OWNERS,
        tenantId: user.tenantId,
      },
      {
        audience: MarketingCampaignAudience.ROLE_USERS,
        OR: [{ tenantId: null }, { tenantId: user.tenantId }],
      },
      {
        audience: MarketingCampaignAudience.SELECTED_USERS,
        userIds: { has: user.userId },
      },
    ];

    if (user.branchId) {
      audienceScope.push({
        audience: MarketingCampaignAudience.BRANCH_USERS,
        tenantId: user.tenantId,
        branchId: user.branchId,
      });
    }

    return {
      status: MarketingCampaignStatus.ACTIVE,
      placement: MarketingCampaignPlacement.MOBILE_HEADER,
      startsAt: { lte: now },
      AND: [
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        { OR: audienceScope },
      ],
    };
  }

  private campaignMatchesUser(
    campaign: CampaignWithRelations,
    user: {
      userId: string;
      tenantId: string;
      branchId: string | null;
      roleNames: string[];
    },
  ) {
    if (campaign.tenantId && campaign.tenantId !== user.tenantId) return false;
    if (campaign.branchId && campaign.branchId !== user.branchId) return false;

    const roles = new Set(user.roleNames.map((role) => role.toLowerCase()));
    switch (campaign.audience) {
      case MarketingCampaignAudience.ALL_USERS:
        return true;
      case MarketingCampaignAudience.TENANT_USERS:
        return campaign.tenantId === user.tenantId;
      case MarketingCampaignAudience.BRANCH_USERS:
        return Boolean(user.branchId && campaign.branchId === user.branchId);
      case MarketingCampaignAudience.TENANT_OWNERS:
        return roles.has('account owner') || roles.has('owner');
      case MarketingCampaignAudience.ROLE_USERS:
        return campaign.roleNames.some((role) => roles.has(role.toLowerCase()));
      case MarketingCampaignAudience.SELECTED_USERS:
        return campaign.userIds.includes(user.userId);
      default:
        return false;
    }
  }

  private async toCampaignContract(
    campaign: CampaignWithRelations,
  ): Promise<MarketingCampaignContract> {
    const mediaUrl = await this.resolveMediaUrl(campaign);
    return {
      id: campaign.id,
      title: campaign.title,
      body: campaign.body,
      ctaLabel: campaign.ctaLabel,
      ctaUrl: campaign.ctaUrl,
      mediaUrl,
      mediaStorageKey: campaign.mediaStorageKey,
      mediaType: campaign.mediaType,
      placement: campaign.placement,
      audience: campaign.audience,
      status: campaign.status,
      tenantId: campaign.tenantId,
      branchId: campaign.branchId,
      tenantName: campaign.tenant?.name ?? null,
      branchName: campaign.branch?.name ?? null,
      roleNames: campaign.roleNames,
      userIds: campaign.userIds,
      priority: campaign.priority,
      startsAt: campaign.startsAt.toISOString(),
      endsAt: campaign.endsAt?.toISOString() ?? null,
      createdBy: {
        id: campaign.createdBy.id,
        name: campaign.createdBy.displayName || campaign.createdBy.email,
        email: campaign.createdBy.email,
      },
      createdAt: campaign.createdAt.toISOString(),
      updatedAt: campaign.updatedAt.toISOString(),
    };
  }

  private async resolveMediaUrl(campaign: CampaignWithRelations) {
    if (campaign.mediaStorageKey) {
      try {
        const signed = await this.objectStorage.presignGet({
          storageKey: campaign.mediaStorageKey,
          expiresInSeconds: 900,
        });
        return signed.downloadUrl;
      } catch {
        return null;
      }
    }
    return campaign.mediaUrl;
  }

  private campaignIncludes() {
    return {
      tenant: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
      createdBy: { select: { id: true, displayName: true, email: true } },
    } satisfies Prisma.MarketingCampaignInclude;
  }

  private mediaTypeFromMime(mimeType: string) {
    if (mimeType.startsWith('image/')) return MarketingCampaignMediaType.IMAGE;
    if (mimeType.startsWith('video/')) return MarketingCampaignMediaType.VIDEO;
    return MarketingCampaignMediaType.NONE;
  }

  private buildCampaignMediaKey(
    fileName: string | undefined,
    mimeType: string,
  ) {
    const extension =
      fileName
        ?.split('.')
        .pop()
        ?.toLowerCase()
        .replace(/[^a-z0-9]/g, '') ||
      mimeType
        .split('/')
        .pop()
        ?.replace(/[^a-z0-9]/g, '') ||
      'bin';
    return `control-center/marketing/${randomUUID()}.${extension}`;
  }

  private cleanNullable(value: string | null | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private cleanList(value: string[] | null | undefined) {
    return [
      ...new Set(
        (value ?? [])
          .map((item) => item.trim())
          .filter((item) => item.length > 0),
      ),
    ];
  }

  private async audit(
    adminId: string,
    action: string,
    newValue: Prisma.InputJsonObject,
  ) {
    await this.prisma.controlCenterAuditLog.create({
      data: {
        adminId,
        action,
        entityType: 'MarketingCampaign',
        entityId:
          typeof newValue.campaignId === 'string' ? newValue.campaignId : null,
        newValue,
      },
    });
  }
}

type RequiredCampaignInput = {
  title: string;
  body: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  mediaUrl?: string | null;
  mediaStorageKey?: string | null;
  mediaType?: string;
  placement?: string;
  audience: string;
  status?: string;
  tenantId?: string | null;
  branchId?: string | null;
  roleNames?: string[];
  userIds?: string[];
  priority?: number;
  startsAt?: string;
  endsAt?: string | null;
};

type NormalizedCampaignInput = {
  title: string;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  mediaUrl: string | null;
  mediaStorageKey: string | null;
  mediaType: MarketingCampaignMediaType;
  placement: MarketingCampaignPlacement;
  audience: MarketingCampaignAudience;
  status: MarketingCampaignStatus;
  tenantId: string | null;
  branchId: string | null;
  roleNames: string[];
  userIds: string[];
  priority: number;
  startsAt: Date;
  endsAt: Date | null;
};
