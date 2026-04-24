/*
  Warnings:

  - A unique constraint covering the columns `[channelId,externalId]` on the table `messages` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "ai_contexts" ADD COLUMN     "debounceMaxWaitSeconds" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "debounceSeconds" INTEGER NOT NULL DEFAULT 8;

-- CreateIndex
CREATE UNIQUE INDEX "messages_channelId_externalId_key" ON "messages"("channelId", "externalId");
