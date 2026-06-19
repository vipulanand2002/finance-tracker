-- Add PDF statement password storage to cards table
ALTER TABLE cards ADD COLUMN IF NOT EXISTS pdf_password text;
