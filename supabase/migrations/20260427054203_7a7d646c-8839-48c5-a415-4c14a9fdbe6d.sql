UPDATE public.plans SET validity_days = 1, updated_at = now() WHERE code = 'free_trial';
-- Shorten any currently-active free trial subs to expire 1 day after they started
UPDATE public.subscriptions s
SET expires_at = LEAST(s.expires_at, s.starts_at + interval '1 day'), updated_at = now()
FROM public.plans p
WHERE s.plan_id = p.id AND p.code = 'free_trial' AND s.status = 'active';