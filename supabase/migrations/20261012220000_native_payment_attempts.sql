-- Private initiation ledger. Unknown outcomes never release the active lock based
-- solely on elapsed time: transaction verification must establish a final state.
CREATE TABLE public.paystack_native_attempts (
  reference text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('live','test')),
  plan text NOT NULL CHECK (plan IN ('premium','premium_plus')),
  cycle text NOT NULL CHECK (cycle IN ('monthly','annual')),
  method text NOT NULL CHECK (method IN ('mpesa','airtel','card')),
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  intent_id uuid NOT NULL,
  request_hash text NOT NULL,
  state text NOT NULL DEFAULT 'creating' CHECK (state IN ('creating','pending','unknown','paid','failed','abandoned','reversed')),
  access_code text,
  auto_renew boolean NOT NULL DEFAULT false,
  enrollment_processed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,mode,intent_id),
  CHECK (reference ~ '^continua-(live|test)-[0-9a-f-]{36}$' AND reference LIKE 'continua-'||mode||'-%')
);
CREATE UNIQUE INDEX paystack_native_one_active ON public.paystack_native_attempts(user_id,mode) WHERE state IN ('creating','pending','unknown');
ALTER TABLE public.paystack_native_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.paystack_native_attempts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.paystack_native_attempts TO service_role;
CREATE TABLE public.paystack_card_renewals (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('test','live')),
  email text NOT NULL, plan text NOT NULL CHECK(plan IN ('premium','premium_plus')),
  authorization_cipher text NOT NULL,
  consent_reference text NOT NULL REFERENCES public.paystack_native_attempts(reference),
  enabled boolean NOT NULL DEFAULT true,
  next_charge_at timestamptz NOT NULL,
  active_reference text UNIQUE REFERENCES public.paystack_native_attempts(reference),
  PRIMARY KEY(user_id,mode)
);
ALTER TABLE public.paystack_card_renewals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.paystack_card_renewals FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.paystack_card_renewals TO service_role;
