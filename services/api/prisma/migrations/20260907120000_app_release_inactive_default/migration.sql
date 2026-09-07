-- New builds stay held until Control Center Send turns them on.
ALTER TABLE "app_releases" ALTER COLUMN "is_active" SET DEFAULT false;
