
-- 1. Add updated_at to plans + allow admins to UPDATE rows (RLS already has ALL for admin)
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS plans_set_updated_at ON public.plans;
CREATE TRIGGER plans_set_updated_at BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Insert Free Trial plan if not present
INSERT INTO public.plans (code, name, price_paise, call_quota, agent_quota, validity_days, sort_order, is_active)
SELECT 'free_trial', 'Free Trial', 0, 5, 1, 14, -1, true
WHERE NOT EXISTS (SELECT 1 FROM public.plans WHERE code = 'free_trial');

-- 3. Site content (CMS) — one editable row
CREATE TABLE IF NOT EXISTS public.site_content (
  id integer PRIMARY KEY DEFAULT 1,
  hero_headline text NOT NULL DEFAULT 'Voice support, on every product.',
  hero_subheadline text NOT NULL DEFAULT 'Register your company, embed one button anywhere, and let an AI hold-assistant chat with customers in their own language while your agents pick up.',
  hero_badge text NOT NULL DEFAULT 'Multi-tenant · AI hold · Free WebRTC',
  pricing_tagline text NOT NULL DEFAULT 'Pay once, use until your validity ends. Cancel any time. Powered by Razorpay.',
  privacy_policy text NOT NULL DEFAULT 'Privacy policy goes here. Edit from the admin panel → Site Content.',
  terms_of_service text NOT NULL DEFAULT 'Terms of service go here. Edit from the admin panel → Site Content.',
  contact_us text NOT NULL DEFAULT 'Reach us at support@example.com. Edit from the admin panel → Site Content.',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_content_singleton CHECK (id = 1)
);
INSERT INTO public.site_content (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone reads site content" ON public.site_content;
CREATE POLICY "Anyone reads site content" ON public.site_content FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin updates site content" ON public.site_content;
CREATE POLICY "Admin updates site content" ON public.site_content FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP TRIGGER IF EXISTS site_content_set_updated_at ON public.site_content;
CREATE TRIGGER site_content_set_updated_at BEFORE UPDATE ON public.site_content
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Auto-grant free trial when admin approves a company
CREATE OR REPLACE FUNCTION public.grant_free_trial_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  trial public.plans;
  existing_id uuid;
BEGIN
  IF NEW.status <> 'approved' THEN RETURN NEW; END IF;
  IF OLD.status = 'approved' THEN RETURN NEW; END IF;
  SELECT * INTO trial FROM public.plans WHERE code = 'free_trial' AND is_active = true LIMIT 1;
  IF trial IS NULL THEN RETURN NEW; END IF;
  -- skip if company already has any active subscription
  SELECT id INTO existing_id FROM public.subscriptions
    WHERE company_id = NEW.id AND status = 'active' AND expires_at > now() LIMIT 1;
  IF existing_id IS NOT NULL THEN RETURN NEW; END IF;
  INSERT INTO public.subscriptions (company_id, plan_id, status, starts_at, expires_at, used_calls)
  VALUES (NEW.id, trial.id, 'active', now(), now() + (trial.validity_days || ' days')::interval, 0);
  -- queue approval email
  INSERT INTO public.email_outbox (to_email, subject, body)
  VALUES (
    NEW.contact_email,
    'Your company has been approved on Zentord',
    'Hi ' || NEW.name || E',\n\nGood news — your company has been approved. You now have a free trial with ' ||
    trial.call_quota || ' calls and ' || trial.agent_quota || ' agent for ' || trial.validity_days ||
    E' days.\n\nLog in: https://chat-bridge-aid.lovable.app/company\n\n— Zentord'
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS companies_grant_free_trial ON public.companies;
CREATE TRIGGER companies_grant_free_trial
  AFTER UPDATE OF status ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.grant_free_trial_on_approval();
