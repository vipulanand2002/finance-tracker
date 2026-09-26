-- Direction of a tagged_payment:
--   'payment' → the sender logged INCOME tagged to this person (they paid the sender)
--   'charge'  → the sender logged an EXPENSE tagged to this person (sender paid for them)
ALTER TABLE tagged_payments
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'payment';
