import { createHash, randomUUID } from 'node:crypto';

export type DeviceMeta = {
  deviceId?: string | null;
  deviceName?: string | null;
  deviceType?: string | null;
  platform?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
};

export function hashRefreshToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function newAuthSessionId() {
  return randomUUID();
}

export function normalizeDeviceMeta(input?: DeviceMeta | null): DeviceMeta {
  const platform = input?.platform?.trim().toUpperCase() || null;
  const deviceName = input?.deviceName?.trim() || null;
  const deviceType =
    input?.deviceType?.trim() ||
    (platform === 'IOS'
      ? 'Mobile App (iOS)'
      : platform === 'ANDROID'
        ? 'Mobile App (Android)'
        : platform === 'WEB'
          ? 'Web App'
          : null);

  return {
    deviceId: input?.deviceId?.trim() || null,
    deviceName: deviceName || (platform === 'WEB' ? 'Web browser' : 'Unknown device'),
    deviceType,
    platform,
    userAgent: input?.userAgent?.trim() || null,
    ipAddress: input?.ipAddress?.trim() || null,
  };
}

export function resolveClientIp(headers: Record<string, unknown>, fallback?: string | null) {
  const forwarded = headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]?.trim() || null;
  }
  if (Array.isArray(forwarded) && typeof forwarded[0] === 'string') {
    return forwarded[0].split(',')[0]?.trim() || null;
  }
  return fallback?.trim() || null;
}
