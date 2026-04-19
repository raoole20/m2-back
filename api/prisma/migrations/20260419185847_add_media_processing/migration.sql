-- CreateEnum
CREATE TYPE "MediaProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'SKIPPED', 'FAILED');

-- AlterTable
ALTER TABLE "ai_contexts" ADD COLUMN     "allowedMediaTypes" "ContentType"[] DEFAULT ARRAY['TEXT']::"ContentType"[],
ADD COLUMN     "mediaProcessorApiBaseUrl" TEXT,
ADD COLUMN     "mediaProcessorApiKey" TEXT,
ADD COLUMN     "mediaProcessorFallbackToDefault" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "mediaProcessorModel" TEXT,
ADD COLUMN     "mediaProcessorProvider" "AiProvider" NOT NULL DEFAULT 'GEMINI',
ADD COLUMN     "unsupportedMediaMessage" TEXT;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "mediaProcessingError" TEXT,
ADD COLUMN     "mediaProcessingStatus" "MediaProcessingStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "transcription" TEXT;
