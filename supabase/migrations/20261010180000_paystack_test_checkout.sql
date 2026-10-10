-- Isolated test receipts. Nothing here changes real membership or billing.
CREATE TABLE public.paystack_test_orders (
  reference text PRIMARY KEY CHECK (reference ~ '^continua-test-[0-9a-f-]{36}$'),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  plan text NOT NULL CHECK (plan IN ('premium','premium_plus')),
  cycle text NOT NULL CHECK (cycle IN ('monthly','annual')),
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid')),
  provider_transaction_id bigint UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz
);
ALTER TABLE public.paystack_test_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.paystack_test_orders FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.paystack_test_orders TO service_role;
CREATE INDEX paystack_test_orders_owner ON public.paystack_test_orders(user_id,created_at DESC);
