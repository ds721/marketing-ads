-- AlterTable
ALTER TABLE "brand_settings" ADD COLUMN     "flyerTemplate" TEXT NOT NULL DEFAULT 'bold';

-- AlterTable
ALTER TABLE "marketing_campaigns" ADD COLUMN     "heroAssetId" TEXT,
ADD COLUMN     "templateId" TEXT;

