-- AlterTable
ALTER TABLE "ideas" ADD COLUMN     "designSpec" JSONB,
ADD COLUMN     "heroAssetId" TEXT,
ADD COLUMN     "styleRefAssetId" TEXT,
ADD COLUMN     "templateId" TEXT;
