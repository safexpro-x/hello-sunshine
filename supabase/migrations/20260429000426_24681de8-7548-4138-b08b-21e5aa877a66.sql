
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS mobile text;
ALTER TABLE public.smtp_settings ADD COLUMN IF NOT EXISTS use_supabase_fallback boolean NOT NULL DEFAULT true;

INSERT INTO public.plans (code, name, price_paise, call_quota, agent_quota, validity_days, is_active, sort_order)
VALUES
  ('yearly_starter',   'Yearly Starter',   149900, 15000, 2,   365, true, 100),
  ('yearly_growth',    'Yearly Growth',    299900, 30000, 15,  365, true, 110),
  ('yearly_unlimited', 'Yearly Unlimited', 499900, NULL,  50,  365, true, 120)
ON CONFLICT (code) DO NOTHING;
