-- Add deletedAt soft-delete column to main entities.
-- Pre-existing records keep deletedAt = NULL (not deleted).
-- Records with isActive = false are treated as "paused", NOT deleted.
-- If you had records that were actually meant to be deleted, run a manual
-- UPDATE statement to set deletedAt on those rows after this migration.

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "channels" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "ai_contexts" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "tenants_deletedAt_idx" ON "tenants"("deletedAt");
CREATE INDEX "users_tenantId_deletedAt_idx" ON "users"("tenantId", "deletedAt");
CREATE INDEX "channels_tenantId_deletedAt_idx" ON "channels"("tenantId", "deletedAt");
CREATE INDEX "ai_contexts_tenantId_deletedAt_idx" ON "ai_contexts"("tenantId", "deletedAt");

-- Replace full unique constraints with partial unique indexes so that
-- soft-deleted records do not block re-creation with the same identifier.
DROP INDEX IF EXISTS "users_tenantId_email_key";
CREATE UNIQUE INDEX "users_tenantId_email_key"
  ON "users" ("tenantId", "email")
  WHERE "deletedAt" IS NULL;

DROP INDEX IF EXISTS "channels_tenantId_type_provider_name_key";
CREATE UNIQUE INDEX "channels_tenantId_type_provider_name_key"
  ON "channels" ("tenantId", "type", "provider", "name")
  WHERE "deletedAt" IS NULL;
