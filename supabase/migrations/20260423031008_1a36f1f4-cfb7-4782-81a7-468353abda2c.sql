
-- =========================================================
-- PLANS
-- =========================================================
CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  price_paise integer NOT NULL,
  call_quota integer, -- NULL = unlimited
  validity_days integer NOT NULL DEFAULT 30,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads active plans" ON public.plans FOR SELECT USING (is_active = true);
CREATE POLICY "Admins manage plans" ON public.plans FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.plans (code, name, price_paise, call_quota, validity_days, sort_order) VALUES
  ('starter','Starter', 9900, 200, 30, 1),
  ('growth','Growth', 29900, 700, 30, 2),
  ('unlimited','Unlimited', 49900, NULL, 30, 3);

-- =========================================================
-- SUBSCRIPTIONS
-- =========================================================
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.plans(id),
  status text NOT NULL DEFAULT 'active', -- active|expired|cancelled
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_calls integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscriptions_company ON public.subscriptions(company_id, status);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner views own subs" ON public.subscriptions FOR SELECT
  USING (company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Employee views company sub" ON public.subscriptions FOR SELECT
  USING (company_id = get_employee_company_id(auth.uid()));
CREATE POLICY "Admin manages subs" ON public.subscriptions FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
-- Public readable for widget gating (lightweight)
CREATE POLICY "Public can read active sub for approved company" ON public.subscriptions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = subscriptions.company_id AND c.status = 'approved'));

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- PAYMENTS
-- =========================================================
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.plans(id),
  razorpay_order_id text UNIQUE,
  razorpay_payment_id text,
  razorpay_signature text,
  amount_paise integer NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'created', -- created|paid|failed
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
CREATE INDEX idx_payments_company ON public.payments(company_id, created_at DESC);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner views own payments" ON public.payments FOR SELECT
  USING (company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Admin views all payments" ON public.payments FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- RAZORPAY SETTINGS (admin only)
-- =========================================================
CREATE TABLE public.razorpay_settings (
  id integer PRIMARY KEY DEFAULT 1,
  key_id text,
  key_secret text,
  webhook_secret text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT singleton CHECK (id = 1)
);
INSERT INTO public.razorpay_settings (id) VALUES (1);
ALTER TABLE public.razorpay_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin reads razorpay" ON public.razorpay_settings FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin writes razorpay" ON public.razorpay_settings FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- WIDGET SLUGS (short opaque IDs to hide api_key)
-- =========================================================
CREATE TABLE public.widget_slugs (
  slug text PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_widget_slugs_company ON public.widget_slugs(company_id);
ALTER TABLE public.widget_slugs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can resolve active slug" ON public.widget_slugs FOR SELECT
  USING (is_active = true);
CREATE POLICY "Owner manages own slugs" ON public.widget_slugs FOR ALL
  USING (company_id = get_user_company_id(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Admin manages slugs" ON public.widget_slugs FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.generate_short_slug()
RETURNS text LANGUAGE sql VOLATILE SET search_path = public AS $$
  SELECT lower(encode(extensions.gen_random_bytes(8), 'hex'));
$$;

-- Auto-create a slug for every approved company (existing + future)
INSERT INTO public.widget_slugs (slug, company_id)
SELECT public.generate_short_slug(), id FROM public.companies
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.ensure_company_slug()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.widget_slugs (slug, company_id)
  VALUES (public.generate_short_slug(), NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER company_create_slug AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.ensure_company_slug();

-- =========================================================
-- CALL SESSIONS (auto-expire links)
-- =========================================================
CREATE TABLE public.call_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  customer_token text UNIQUE NOT NULL,
  agent_token text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 hours'),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_call_sessions_call ON public.call_sessions(call_id);
ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read by token" ON public.call_sessions FOR SELECT USING (true);
CREATE POLICY "Public can insert session" ON public.call_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can mark consumed" ON public.call_sessions FOR UPDATE
  USING (consumed_at IS NULL) WITH CHECK (true);

-- =========================================================
-- BLOCKED IPS (per company)
-- =========================================================
CREATE TABLE public.blocked_ips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ip_address text NOT NULL,
  blocked_by uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, ip_address)
);
CREATE INDEX idx_blocked_ips_company ON public.blocked_ips(company_id);
ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages blocked ips" ON public.blocked_ips FOR ALL
  USING (company_id = get_user_company_id(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Employee manages blocked ips" ON public.blocked_ips FOR ALL
  USING (company_id = get_employee_company_id(auth.uid()))
  WITH CHECK (company_id = get_employee_company_id(auth.uid()));
CREATE POLICY "Admin views blocked ips" ON public.blocked_ips FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Public can read for gating" ON public.blocked_ips FOR SELECT USING (true);

-- =========================================================
-- EMAIL OUTBOX (plan expiry / reminders)
-- =========================================================
CREATE TABLE public.email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending|sent|failed
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin views outbox" ON public.email_outbox FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- CALLS: customer info columns
-- =========================================================
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS customer_ip text,
  ADD COLUMN IF NOT EXISTS customer_email text,
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS customer_issue text;

-- =========================================================
-- EMPLOYEES: 1 email = 1 company
-- =========================================================
-- Drop duplicates first if any (keep oldest)
DELETE FROM public.employees a USING public.employees b
WHERE a.ctid > b.ctid AND lower(a.email) = lower(b.email);
CREATE UNIQUE INDEX IF NOT EXISTS employees_email_unique ON public.employees (lower(email));

-- =========================================================
-- HELPER FUNCTIONS
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_company_active_subscription(_company_id uuid)
RETURNS public.subscriptions
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.subscriptions
  WHERE company_id = _company_id AND status = 'active' AND expires_at > now()
  ORDER BY expires_at DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_company_make_call(_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.subscriptions; quota integer;
BEGIN
  SELECT * INTO s FROM public.get_company_active_subscription(_company_id);
  IF s IS NULL THEN RETURN false; END IF;
  SELECT call_quota INTO quota FROM public.plans WHERE id = s.plan_id;
  IF quota IS NULL THEN RETURN true; END IF; -- unlimited
  RETURN s.used_calls < quota;
END $$;

CREATE OR REPLACE FUNCTION public.consume_call_quota(_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.subscriptions; quota integer;
BEGIN
  SELECT * INTO s FROM public.get_company_active_subscription(_company_id);
  IF s IS NULL THEN RETURN false; END IF;
  SELECT call_quota INTO quota FROM public.plans WHERE id = s.plan_id;
  IF quota IS NOT NULL AND s.used_calls >= quota THEN RETURN false; END IF;
  UPDATE public.subscriptions SET used_calls = used_calls + 1, updated_at = now() WHERE id = s.id;
  RETURN true;
END $$;

-- Activate sub after payment
CREATE OR REPLACE FUNCTION public.activate_subscription_for_payment(_payment_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.payments; pl public.plans; sub_id uuid; new_expiry timestamptz;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = _payment_id;
  IF p IS NULL OR p.status <> 'paid' THEN RAISE EXCEPTION 'Payment not paid'; END IF;
  SELECT * INTO pl FROM public.plans WHERE id = p.plan_id;
  new_expiry := now() + (pl.validity_days || ' days')::interval;
  -- Mark previous subs expired
  UPDATE public.subscriptions SET status = 'expired' WHERE company_id = p.company_id AND status = 'active';
  INSERT INTO public.subscriptions (company_id, plan_id, status, starts_at, expires_at, used_calls)
  VALUES (p.company_id, p.plan_id, 'active', now(), new_expiry, 0)
  RETURNING id INTO sub_id;
  RETURN sub_id;
END $$;
