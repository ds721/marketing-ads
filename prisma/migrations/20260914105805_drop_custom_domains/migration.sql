-- DropForeignKey
ALTER TABLE "tenant_domains" DROP CONSTRAINT "tenant_domains_tenantId_fkey";

-- DropTable
DROP TABLE "tenant_domains";

-- DropEnum
DROP TYPE "DomainStatus";

