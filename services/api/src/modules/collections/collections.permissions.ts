export const COLLECTION_PERMISSIONS = {
  create: 'collection.create',
  read: 'collection.read',
  reconcile: 'collection.reconcile',
} as const;

export const COLLECTION_PERMISSION_LIST = Object.values(COLLECTION_PERMISSIONS);
