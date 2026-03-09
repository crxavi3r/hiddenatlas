-- AlterTable
ALTER TABLE "Itinerary" ADD COLUMN     "excerpt" TEXT,
ADD COLUMN     "htmlContent" TEXT,
ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pdfUrl" TEXT;

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'paid';
