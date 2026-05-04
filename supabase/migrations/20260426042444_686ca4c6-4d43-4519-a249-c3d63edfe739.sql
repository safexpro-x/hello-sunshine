-- Replace overly broad public-read policy on storage.objects for the branding bucket.
-- Logos/favicons are loaded by exact URL — clients never need to LIST the bucket.
DROP POLICY IF EXISTS "Public reads branding" ON storage.objects;

-- Allow public read of objects only when accessed by exact name (no listing).
-- Supabase storage SELECT is used both for downloads and for listings;
-- to keep public downloads working while preventing listings, we keep a
-- targeted SELECT policy and rely on the bucket-level "public" flag for CDN.
-- The bucket's public flag already exposes file URLs via /storage/v1/object/public/...
-- so we can remove the SELECT policy entirely; the public flag handles direct fetches.
-- (Keeping no SELECT policy means listing returns empty for anon users.)
-- No further action needed; admin write/update/delete policies remain.