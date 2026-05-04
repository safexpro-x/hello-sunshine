
-- Test mode + separate test keys for Razorpay
ALTER TABLE public.razorpay_settings
  ADD COLUMN IF NOT EXISTS test_mode boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS test_key_id text,
  ADD COLUMN IF NOT EXISTS test_key_secret text;

-- Track which mode a payment was made in
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

-- Seed default plans if missing
INSERT INTO public.plans (code, name, price_paise, call_quota, validity_days, sort_order, is_active)
VALUES
  ('starter', 'Starter', 9900, 200, 30, 1, true),
  ('growth', 'Growth', 29900, 700, 30, 2, true),
  ('unlimited', 'Unlimited', 49900, NULL, 30, 3, true)
ON CONFLICT (code) DO NOTHING;

-- Ensure razorpay_settings row exists
INSERT INTO public.razorpay_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
