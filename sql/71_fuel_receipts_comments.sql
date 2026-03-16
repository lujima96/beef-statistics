ALTER TABLE IF EXISTS beef_data.fuel_receipts
ADD COLUMN IF NOT EXISTS comments text;

