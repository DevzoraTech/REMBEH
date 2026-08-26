export const SYNC_PERMISSIONS = {
  download: 'sync.download',
  upload: 'sync.upload',
} as const;

export const SYNC_PERMISSION_LIST = Object.values(SYNC_PERMISSIONS);
