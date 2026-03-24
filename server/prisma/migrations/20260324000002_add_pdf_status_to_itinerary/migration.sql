-- Add PDF generation status tracking fields to Itinerary
ALTER TABLE "Itinerary"
  ADD COLUMN IF NOT EXISTS "pdfStatus"      TEXT,
  ADD COLUMN IF NOT EXISTS "pdfGeneratedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pdfError"       TEXT;

-- Mark existing itineraries that already have a pdfUrl as 'ready'
UPDATE "Itinerary"
  SET "pdfStatus" = 'ready'
  WHERE "pdfUrl" IS NOT NULL AND "pdfUrl" != '';

-- Mark itineraries without a PDF as 'stale' (content exists but no PDF generated)
UPDATE "Itinerary"
  SET "pdfStatus" = 'stale'
  WHERE ("pdfUrl" IS NULL OR "pdfUrl" = '') AND status = 'published';
