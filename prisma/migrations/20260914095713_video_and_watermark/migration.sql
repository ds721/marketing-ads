-- CreateEnum
CREATE TYPE "WatermarkPosition" AS ENUM ('TOP_LEFT', 'TOP_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_RIGHT', 'CENTER');

-- CreateEnum
CREATE TYPE "VideoScriptStatus" AS ENUM ('DRAFT', 'READY', 'USED');

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "durationSec" DOUBLE PRECISION,
ADD COLUMN     "posterKey" TEXT,
ADD COLUMN     "sourceAssetId" TEXT,
ADD COLUMN     "watermarked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "brand_settings" ADD COLUMN     "watermarkEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "watermarkOpacity" INTEGER NOT NULL DEFAULT 75,
ADD COLUMN     "watermarkPosition" "WatermarkPosition" NOT NULL DEFAULT 'BOTTOM_RIGHT',
ADD COLUMN     "watermarkText" TEXT;

-- AlterTable
ALTER TABLE "content_items" ADD COLUMN     "videoScriptId" TEXT;

-- CreateTable
CREATE TABLE "video_scripts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT,
    "concept" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "shots" JSONB NOT NULL,
    "voiceover" TEXT,
    "caption" TEXT NOT NULL,
    "cta" TEXT,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "durationSec" INTEGER NOT NULL DEFAULT 30,
    "format" TEXT NOT NULL DEFAULT 'reel',
    "status" "VideoScriptStatus" NOT NULL DEFAULT 'DRAFT',
    "generatedBy" TEXT,
    "promptVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_scripts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "video_scripts_tenantId_createdAt_idx" ON "video_scripts"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "content_items_videoScriptId_key" ON "content_items"("videoScriptId");

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_videoScriptId_fkey" FOREIGN KEY ("videoScriptId") REFERENCES "video_scripts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_scripts" ADD CONSTRAINT "video_scripts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

