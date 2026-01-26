-- Add tier and charge_id columns to payments table
ALTER TABLE payments ADD COLUMN IF NOT EXISTS tier TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS charge_id TEXT;

-- Create index for charge_id lookups (for refunds)
CREATE INDEX IF NOT EXISTS idx_payments_charge_id ON payments(charge_id);
