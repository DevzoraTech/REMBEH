import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type App,
  cert,
  getApps,
  initializeApp,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { resolveWebAppBaseUrl } from '../../common/config/web-app-url';
import { PrismaService } from '../../database/prisma.service';

type FirebaseProjectKey = 'WEB' | 'MOBILE';

export type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
  href?: string;
};

@Injectable()
export class FcmPushService implements OnModuleInit {
  private readonly logger = new Logger(FcmPushService.name);
  private readonly apps = new Map<FirebaseProjectKey, App>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.bootstrapApp(
      'WEB',
      ['FIREBASE_WEB_SERVICE_ACCOUNT_JSON', 'FIREBASE_SERVICE_ACCOUNT_JSON'],
      ['FIREBASE_WEB_SERVICE_ACCOUNT_PATH', 'FIREBASE_SERVICE_ACCOUNT_PATH'],
    );
    this.bootstrapApp(
      'MOBILE',
      ['FIREBASE_MOBILE_SERVICE_ACCOUNT_JSON', 'FIREBASE_SERVICE_ACCOUNT_JSON'],
      ['FIREBASE_MOBILE_SERVICE_ACCOUNT_PATH', 'FIREBASE_SERVICE_ACCOUNT_PATH'],
    );

    if (this.apps.size === 0) {
      this.logger.warn(
        'FCM disabled: set FIREBASE_*_SERVICE_ACCOUNT_JSON or FIREBASE_*_SERVICE_ACCOUNT_PATH',
      );
    } else {
      this.logger.log(
        `FCM ready for projects: ${[...this.apps.keys()].join(', ')}`,
      );
    }
  }

  isEnabled(projectKey?: FirebaseProjectKey) {
    if (projectKey) {
      return this.apps.has(projectKey);
    }
    return this.apps.size > 0;
  }

  async registerToken(input: {
    tenantId: string;
    userId: string;
    token: string;
    platform: 'WEB' | 'ANDROID' | 'IOS';
    projectKey?: FirebaseProjectKey;
    deviceId?: string | null;
    userAgent?: string | null;
  }) {
    const projectKey =
      input.projectKey ?? (input.platform === 'WEB' ? 'WEB' : 'MOBILE');

    return this.prisma.devicePushToken.upsert({
      where: { token: input.token },
      create: {
        tenantId: input.tenantId,
        userId: input.userId,
        token: input.token,
        platform: input.platform,
        projectKey,
        deviceId: input.deviceId ?? null,
        userAgent: input.userAgent ?? null,
        enabled: true,
        lastSeenAt: new Date(),
      },
      update: {
        tenantId: input.tenantId,
        userId: input.userId,
        platform: input.platform,
        projectKey,
        deviceId: input.deviceId ?? null,
        userAgent: input.userAgent ?? null,
        enabled: true,
        lastSeenAt: new Date(),
      },
    });
  }

  async unregisterToken(input: { userId: string; token: string }) {
    await this.prisma.devicePushToken.updateMany({
      where: { userId: input.userId, token: input.token },
      data: { enabled: false },
    });
  }

  async sendToUser(
    tenantId: string,
    userId: string,
    payload: PushPayload,
  ): Promise<{
    attempted: number;
    success: number;
    reason?: 'fcm_disabled' | 'no_tokens' | 'send_failed';
    message?: string;
  }> {
    const tokens = await this.prisma.devicePushToken.findMany({
      where: { tenantId, userId, enabled: true },
    });

    if (tokens.length === 0) {
      return {
        attempted: 0,
        success: 0,
        reason: 'no_tokens',
        message:
          'No browser is registered for alerts yet. Turn on alerts in Settings, then try again.',
      };
    }

    const neededProjects = new Set(
      tokens.map((row) =>
        row.projectKey === 'WEB' ? ('WEB' as const) : ('MOBILE' as const),
      ),
    );
    const missingProjects = [...neededProjects].filter(
      (projectKey) => !this.apps.has(projectKey),
    );
    if (missingProjects.length > 0) {
      this.logger.warn(`FCM not configured for: ${missingProjects.join(', ')}`);
      return {
        attempted: tokens.length,
        success: 0,
        reason: 'fcm_disabled',
        message:
          'Push delivery is not configured on the server. Ask an admin to set Firebase service accounts.',
      };
    }

    let success = 0;
    for (const row of tokens) {
      const projectKey = (
        row.projectKey === 'WEB' ? 'WEB' : 'MOBILE'
      ) as FirebaseProjectKey;
      const result = await this.sendToToken(projectKey, row.token, payload);
      if (result === 'ok') {
        success += 1;
      } else if (result === 'invalid_token') {
        await this.prisma.devicePushToken.updateMany({
          where: { id: row.id },
          data: { enabled: false },
        });
      }
    }

    if (success === 0) {
      return {
        attempted: tokens.length,
        success: 0,
        reason: 'send_failed',
        message:
          'Alert could not be delivered to this browser. Turn alerts off and on again, then retry.',
      };
    }

    return { attempted: tokens.length, success };
  }

  async sendToToken(
    projectKey: FirebaseProjectKey,
    token: string,
    payload: PushPayload,
  ): Promise<'ok' | 'no_app' | 'invalid_token' | 'error'> {
    const app = this.apps.get(projectKey);
    if (!app) {
      this.logger.warn(`No Firebase admin app for ${projectKey}`);
      return 'no_app';
    }

    const data: Record<string, string> = {
      ...(payload.data ?? {}),
    };
    if (payload.href) {
      data.href = payload.href;
    }

    try {
      const webOrigin = resolveWebAppBaseUrl(this.config);
      const href = payload.href?.startsWith('http')
        ? payload.href
        : `${webOrigin}${payload.href?.startsWith('/') ? payload.href : `/${payload.href ?? 'owner'}`}`;
      const icon = `${webOrigin}/rembeh-icon.png`;

      // Prefer webpush.notification (absolute icon/link). Avoid relying on relative paths —
      // Chrome often fails to surface web push when icon/link are not absolute HTTPS URLs.
      await getMessaging(app).send({
        token,
        data: {
          ...data,
          title: payload.title,
          body: payload.body,
          href,
        },
        android: {
          priority: 'high',
          notification: {
            title: payload.title,
            body: payload.body,
            channelId: 'rembeh_alerts',
            clickAction: 'FLUTTER_NOTIFICATION_CLICK',
          },
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title: payload.title,
                body: payload.body,
              },
              sound: 'default',
              contentAvailable: true,
            },
          },
        },
        webpush: {
          headers: {
            Urgency: 'high',
            TTL: '86400',
          },
          notification: {
            title: payload.title,
            body: payload.body,
            icon,
            badge: icon,
            requireInteraction: true,
          },
          fcmOptions: {
            link: href,
          },
        },
      });
      return 'ok';
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: string }).code)
          : '';
      this.logger.warn(
        `FCM send failed (${projectKey}): ${code || (error instanceof Error ? error.message : 'unknown')}`,
      );
      if (
        code.includes('registration-token-not-registered') ||
        code.includes('invalid-registration-token') ||
        code.includes('invalid-argument')
      ) {
        return 'invalid_token';
      }
      return 'error';
    }
  }

  private bootstrapApp(
    key: FirebaseProjectKey,
    jsonEnvKeys: string[],
    pathEnvKeys: string[],
  ) {
    if (this.apps.has(key)) {
      return;
    }

    for (const envKey of jsonEnvKeys) {
      const raw = this.config.get<string>(envKey)?.trim();
      if (!raw) {
        continue;
      }
      if (this.tryInitFromJson(key, envKey, raw)) {
        return;
      }
    }

    for (const envKey of pathEnvKeys) {
      const raw = this.config.get<string>(envKey)?.trim();
      if (!raw) {
        continue;
      }
      const filePath = isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
      if (!existsSync(filePath)) {
        this.logger.error(`${envKey} file not found: ${filePath}`);
        continue;
      }
      try {
        const rawJson = readFileSync(filePath, 'utf8');
        if (this.tryInitFromJson(key, envKey, rawJson)) {
          return;
        }
      } catch (error) {
        this.logger.error(
          `Failed reading ${envKey}: ${error instanceof Error ? error.message : 'read error'}`,
        );
      }
    }
  }

  private tryInitFromJson(
    key: FirebaseProjectKey,
    envKey: string,
    raw: string,
  ): boolean {
    try {
      const parsed = JSON.parse(raw) as ServiceAccount;
      const appName = `rembeh-${key.toLowerCase()}`;
      const existing = getApps().find((app) => app.name === appName);
      const app =
        existing ??
        initializeApp(
          {
            credential: cert(parsed),
          },
          appName,
        );
      this.apps.set(key, app);
      return true;
    } catch (error) {
      this.logger.error(
        `Invalid ${envKey} JSON: ${error instanceof Error ? error.message : 'parse error'}`,
      );
      return false;
    }
  }
}
