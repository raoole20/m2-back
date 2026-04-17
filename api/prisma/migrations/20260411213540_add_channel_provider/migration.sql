/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,type,provider,name]` on the table `channels` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ChannelProvider" AS ENUM ('META', 'EVOLUTION');

-- DropIndex
DROP INDEX "channels_tenantId_type_name_key";

-- AlterTable
ALTER TABLE "channels" ADD COLUMN     "provider" "ChannelProvider" NOT NULL DEFAULT 'META';

-- CreateIndex
CREATE UNIQUE INDEX "channels_tenantId_type_provider_name_key" ON "channels"("tenantId", "type", "provider", "name");
