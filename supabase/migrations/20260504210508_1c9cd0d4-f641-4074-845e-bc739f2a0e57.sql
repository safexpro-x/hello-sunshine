-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'company_owner', 'employee');
CREATE TYPE public.company_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.call_status AS ENUM ('waiting', 'active', 'ended');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  phone TEXT,
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============ COMPANIES ============
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  website TEXT,
  business_description TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  mobile TEXT,
  api_key TEXT NOT NULL UNIQUE DEFAULT ('vx_' || encode(gen_random_bytes(24), 'hex')),
  status company_status NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_companies_api_key ON public.companies(api_key);
CREATE INDEX idx_companies_owner ON public.companies(owner_id);

-- ============ EMPLOYEES ============
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'agent',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, email)
);
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_employees_company ON public.employees(company_id);
CREATE INDEX idx_employees_user ON public.employees(user_id);
CREATE UNIQUE INDEX employees_email_unique ON public.employees (lower(email));

-- ============ CALLS ============
CREATE TABLE public.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL UNIQUE,
  customer_name TEXT,
  customer_info TEXT,
  customer_ip TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_issue TEXT,
  language TEXT,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  status call_status NOT NULL DEFAULT 'waiting',
  ai_handled BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  picked_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_calls_company ON public.calls(company_id);
CREATE INDEX idx_calls_room ON public.calls(room_id);
CREATE INDEX idx_calls_status ON public.calls(status);
CREATE INDEX idx_calls_employee ON public.calls(employee_id);

-- ============ HELPER FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id UUID)
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.companies WHERE owner_id = _user_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_employee_company_id(_user_id UUID)
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT company_id FROM public.employees WHERE user_id = _user_id AND is_active = true LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, display_name, phone, email_verified_at)
  VALUES (
    NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NULLIF(NEW.raw_user_meta_data->>'phone', ''),
    CASE WHEN COALESCE(NEW.raw_user_meta_data->>'email_verified', 'false') = 'true' THEN now() ELSE NULL END
  )
  ON CONFLICT (user_id) DO UPDATE SET
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
    email_verified_at = COALESCE(EXCLUDED.email_verified_at, public.profiles.email_verified_at);

  IF NEW.email = 'admin@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.employees SET user_id = NEW.id WHERE email = NEW.email AND user_id IS NULL;
  IF FOUND THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'employee') ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_employees_updated BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_calls_updated BEFORE UPDATE ON public.calls FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ RLS POLICIES ============
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Owner can self-assign on signup" ON public.user_roles FOR INSERT WITH CHECK (auth.uid() = user_id AND role = 'company_owner');

CREATE POLICY "Public can lookup approved companies by api_key" ON public.companies FOR SELECT USING (status = 'approved');
CREATE POLICY "Owner views own company" ON public.companies FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Employee views their company" ON public.companies FOR SELECT USING (id = public.get_employee_company_id(auth.uid()));
CREATE POLICY "Admin views all companies" ON public.companies FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated users can register company" ON public.companies FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owner updates own company" ON public.companies FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Admin updates any company" ON public.companies FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin deletes companies" ON public.companies FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Owner manages own employees" ON public.employees FOR ALL
  USING (company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Employees view colleagues" ON public.employees FOR SELECT USING (company_id = public.get_employee_company_id(auth.uid()));
CREATE POLICY "Admins manage employees" ON public.employees FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public create call for approved company" ON public.calls FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.status = 'approved'));
CREATE POLICY "Public can read their room" ON public.calls FOR SELECT USING (true);
CREATE POLICY "Public update non-ended call" ON public.calls FOR UPDATE USING (status <> 'ended') WITH CHECK (status IN ('waiting','active','ended'));
CREATE POLICY "Owner views company calls" ON public.calls FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Employee views company calls" ON public.calls FOR SELECT USING (company_id = public.get_employee_company_id(auth.uid()));
CREATE POLICY "Admin views all calls" ON public.calls FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.companies;

-- ============ PLANS ============
CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  price_paise integer NOT NULL,
  call_quota integer,
  agent_quota integer,
  validity_days integer NOT NULL DEFAULT 30,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads active plans" ON public.plans FOR SELECT USING (is_active = true);
CREATE POLICY "Admins manage plans" ON public.plans FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER plans_set_updated_at BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.plans (code, name, price_paise, call_quota, agent_quota, validity_days, sort_order, is_active) VALUES
  ('free_trial','Free Trial', 0, 5, 1, 1, -1, true),
  ('starter','Starter', 9900, 200, 2, 30, 1, true),
  ('growth','Growth', 29900, 700, 5, 30, 2, true),
  ('unlimited','Unlimited', 49900, NULL, NULL, 30, 3, true),
  ('yearly_starter','Yearly Starter', 149900, 15000, 2, 365, 100, true),
  ('yearly_growth','Yearly Growth', 299900, 30000, 15, 365, 110, true),
  ('yearly_unlimited','Yearly Unlimited', 499900, NULL, 50, 365, 120, true)
ON CONFLICT (code) DO NOTHING;

-- ============ SUBSCRIPTIONS ============
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.plans(id),
  status text NOT NULL DEFAULT 'active',
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_calls integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscriptions_company ON public.subscriptions(company_id, status);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner views own subs" ON public.subscriptions FOR SELECT USING (company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Employee views company sub" ON public.subscriptions FOR SELECT USING (company_id = get_employee_company_id(auth.uid()));
CREATE POLICY "Admin manages subs" ON public.subscriptions FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Public can read active sub for approved company" ON public.subscriptions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = subscriptions.company_id AND c.status = 'approved'));
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ PAYMENTS ============
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.plans(id),
  razorpay_order_id text UNIQUE,
  razorpay_payment_id text,
  razorpay_signature text,
  amount_paise integer NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'created',
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
CREATE INDEX idx_payments_company ON public.payments(company_id, created_at DESC);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner views own payments" ON public.payments FOR SELECT USING (company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Admin views all payments" ON public.payments FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- ============ RAZORPAY SETTINGS ============
CREATE TABLE public.razorpay_settings (
  id integer PRIMARY KEY DEFAULT 1,
  key_id text,
  key_secret text,
  webhook_secret text,
  test_mode boolean NOT NULL DEFAULT true,
  test_key_id text,
  test_key_secret text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT singleton CHECK (id = 1)
);
INSERT INTO public.razorpay_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE public.razorpay_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin reads razorpay" ON public.razorpay_settings FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin writes razorpay" ON public.razorpay_settings FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ============ WIDGET SLUGS ============
CREATE TABLE public.widget_slugs (
  slug text PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_widget_slugs_company ON public.widget_slugs(company_id);
ALTER TABLE public.widget_slugs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can resolve active slug" ON public.widget_slugs FOR SELECT USING (is_active = true);
CREATE POLICY "Owner manages own slugs" ON public.widget_slugs FOR ALL USING (company_id = get_user_company_id(auth.uid())) WITH CHECK (company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Admin manages slugs" ON public.widget_slugs FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.generate_short_slug()
RETURNS text LANGUAGE sql VOLATILE SET search_path = public AS $$
  SELECT lower(encode(extensions.gen_random_bytes(8), 'hex'));
$$;

CREATE OR REPLACE FUNCTION public.ensure_company_slug()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.widget_slugs (slug, company_id) VALUES (public.generate_short_slug(), NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER company_create_slug AFTER INSERT ON public.companies FOR EACH ROW EXECUTE FUNCTION public.ensure_company_slug();

-- ============ CALL SESSIONS ============
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
CREATE POLICY "Public can mark consumed" ON public.call_sessions FOR UPDATE USING (consumed_at IS NULL) WITH CHECK (true);

-- ============ BLOCKED IPS ============
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
CREATE POLICY "Owner manages blocked ips" ON public.blocked_ips FOR ALL USING (company_id = get_user_company_id(auth.uid())) WITH CHECK (company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Employee manages blocked ips" ON public.blocked_ips FOR ALL USING (company_id = get_employee_company_id(auth.uid())) WITH CHECK (company_id = get_employee_company_id(auth.uid()));
CREATE POLICY "Admin views blocked ips" ON public.blocked_ips FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Public can read for gating" ON public.blocked_ips FOR SELECT USING (true);

-- ============ EMAIL OUTBOX ============
CREATE TABLE public.email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin views outbox" ON public.email_outbox FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- ============ SMTP SETTINGS ============
CREATE TABLE public.smtp_settings (
  id integer PRIMARY KEY DEFAULT 1,
  host text,
  port integer DEFAULT 587,
  username text,
  password text,
  from_email text,
  from_name text DEFAULT 'Zentord',
  use_tls boolean NOT NULL DEFAULT true,
  use_ssl boolean NOT NULL DEFAULT false,
  use_supabase_fallback boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT smtp_singleton CHECK (id = 1)
);
INSERT INTO public.smtp_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE public.smtp_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin reads smtp" ON public.smtp_settings FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin writes smtp" ON public.smtp_settings FOR UPDATE USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ COMPANY IP WHITELIST ============
CREATE TABLE public.company_ip_whitelist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ip_address text NOT NULL,
  label text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, ip_address)
);
ALTER TABLE public.company_ip_whitelist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages whitelist" ON public.company_ip_whitelist FOR ALL USING (company_id = public.get_user_company_id(auth.uid())) WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Admin views whitelist" ON public.company_ip_whitelist FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Public reads whitelist for gating" ON public.company_ip_whitelist FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.is_ip_allowed_for_company(_company_id uuid, _ip text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE has_any boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.company_ip_whitelist WHERE company_id = _company_id) INTO has_any;
  IF NOT has_any THEN RETURN true; END IF;
  IF _ip IS NULL OR _ip = '' THEN RETURN false; END IF;
  RETURN EXISTS (SELECT 1 FROM public.company_ip_whitelist WHERE company_id = _company_id AND ip_address = _ip);
END $$;

-- ============ PASSWORD RESET TOKENS ============
CREATE TABLE public.password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_prt_token ON public.password_reset_tokens(token);
CREATE INDEX idx_prt_email ON public.password_reset_tokens(email);

-- ============ COMPANY DOMAIN WHITELIST ============
CREATE TABLE public.company_domain_whitelist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  domain text NOT NULL,
  label text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, domain)
);
ALTER TABLE public.company_domain_whitelist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages domain whitelist" ON public.company_domain_whitelist FOR ALL
  USING (company_id = public.get_user_company_id(auth.uid())) WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Admin views domain whitelist" ON public.company_domain_whitelist FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Public reads domain whitelist for gating" ON public.company_domain_whitelist FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.is_origin_allowed_for_company(_company_id uuid, _origin text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE has_any boolean; norm text;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.company_domain_whitelist WHERE company_id = _company_id) INTO has_any;
  IF NOT has_any THEN RETURN true; END IF;
  IF _origin IS NULL OR _origin = '' THEN RETURN false; END IF;
  norm := lower(regexp_replace(_origin, '^https?://', ''));
  norm := split_part(norm, '/', 1);
  norm := split_part(norm, ':', 1);
  RETURN EXISTS (
    SELECT 1 FROM public.company_domain_whitelist
    WHERE company_id = _company_id AND (lower(domain) = norm OR norm LIKE ('%.' || lower(domain)))
  );
END $$;

-- ============ FIREBASE ============
CREATE TABLE public.firebase_user_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid text NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.firebase_user_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own firebase mapping" ON public.firebase_user_map FOR SELECT
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.firebase_settings (
  id integer PRIMARY KEY DEFAULT 1,
  project_id text,
  web_api_key text,
  auth_domain text,
  app_id text,
  is_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT firebase_settings_singleton CHECK (id = 1)
);
ALTER TABLE public.firebase_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin reads firebase settings" ON public.firebase_settings FOR SELECT USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin updates firebase settings" ON public.firebase_settings FOR UPDATE USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
INSERT INTO public.firebase_settings (id, is_enabled) VALUES (1, false) ON CONFLICT (id) DO NOTHING;
CREATE TRIGGER firebase_settings_set_updated_at BEFORE UPDATE ON public.firebase_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ COMPANY APP KEYS ============
CREATE TABLE public.company_app_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Default',
  app_key text NOT NULL UNIQUE DEFAULT ('zk_' || encode(extensions.gen_random_bytes(24), 'hex')),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX company_app_keys_company_idx ON public.company_app_keys(company_id);
CREATE INDEX company_app_keys_key_idx ON public.company_app_keys(app_key) WHERE is_active = true;
ALTER TABLE public.company_app_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages app keys" ON public.company_app_keys FOR ALL USING (company_id = public.get_user_company_id(auth.uid())) WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Admin views app keys" ON public.company_app_keys FOR SELECT USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.verify_app_key(_key text)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE cid uuid;
BEGIN
  IF _key IS NULL OR length(_key) < 8 THEN RETURN NULL; END IF;
  SELECT company_id INTO cid FROM public.company_app_keys WHERE app_key = _key AND is_active = true LIMIT 1;
  RETURN cid;
END $$;

-- ============ BRAND SETTINGS ============
CREATE TABLE public.brand_settings (
  id integer PRIMARY KEY DEFAULT 1,
  brand_name text NOT NULL DEFAULT 'Zentord',
  logo_url text,
  favicon_url text,
  primary_hsl text NOT NULL DEFAULT '262 83% 58%',
  accent_hsl text NOT NULL DEFAULT '199 89% 48%',
  footer_text text DEFAULT '© Zentord. All rights reserved.',
  support_email text DEFAULT 'support@example.com',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brand_settings_singleton CHECK (id = 1)
);
ALTER TABLE public.brand_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads brand" ON public.brand_settings FOR SELECT USING (true);
CREATE POLICY "Admin updates brand" ON public.brand_settings FOR UPDATE USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
INSERT INTO public.brand_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
CREATE TRIGGER brand_settings_set_updated_at BEFORE UPDATE ON public.brand_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ DEVICE TOKENS ============
CREATE TABLE public.device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fcm_token text NOT NULL,
  platform text NOT NULL DEFAULT 'android',
  is_active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, fcm_token)
);
CREATE INDEX device_tokens_company_idx ON public.device_tokens(company_id) WHERE is_active = true;
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User manages own device tokens" ON public.device_tokens FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin views device tokens" ON public.device_tokens FOR SELECT USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ============ BRANDING STORAGE BUCKET ============
INSERT INTO storage.buckets (id, name, public) VALUES ('branding', 'branding', true) ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Admin writes branding" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin updates branding" ON storage.objects FOR UPDATE USING (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin deletes branding" ON storage.objects FOR DELETE USING (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'::app_role));

-- ============ HELPERS ============
CREATE OR REPLACE FUNCTION public.get_company_active_subscription(_company_id uuid)
RETURNS public.subscriptions LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.subscriptions WHERE company_id = _company_id AND status = 'active' AND expires_at > now()
  ORDER BY expires_at DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_company_make_call(_company_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.subscriptions; quota integer;
BEGIN
  SELECT * INTO s FROM public.get_company_active_subscription(_company_id);
  IF s IS NULL THEN RETURN false; END IF;
  SELECT call_quota INTO quota FROM public.plans WHERE id = s.plan_id;
  IF quota IS NULL THEN RETURN true; END IF;
  RETURN s.used_calls < quota;
END $$;

CREATE OR REPLACE FUNCTION public.consume_call_quota(_company_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.subscriptions; quota integer;
BEGIN
  SELECT * INTO s FROM public.get_company_active_subscription(_company_id);
  IF s IS NULL THEN RETURN false; END IF;
  SELECT call_quota INTO quota FROM public.plans WHERE id = s.plan_id;
  IF quota IS NOT NULL AND s.used_calls >= quota THEN RETURN false; END IF;
  UPDATE public.subscriptions SET used_calls = used_calls + 1, updated_at = now() WHERE id = s.id;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.activate_subscription_for_payment(_payment_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.payments; pl public.plans; sub_id uuid; new_expiry timestamptz;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = _payment_id;
  IF p IS NULL OR p.status <> 'paid' THEN RAISE EXCEPTION 'Payment not paid'; END IF;
  SELECT * INTO pl FROM public.plans WHERE id = p.plan_id;
  new_expiry := now() + (pl.validity_days || ' days')::interval;
  UPDATE public.subscriptions SET status = 'expired' WHERE company_id = p.company_id AND status = 'active';
  INSERT INTO public.subscriptions (company_id, plan_id, status, starts_at, expires_at, used_calls)
  VALUES (p.company_id, p.plan_id, 'active', now(), new_expiry, 0) RETURNING id INTO sub_id;
  RETURN sub_id;
END $$;

CREATE OR REPLACE FUNCTION public.can_company_add_agent(_company_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.subscriptions; quota integer; current_count integer;
BEGIN
  SELECT * INTO s FROM public.get_company_active_subscription(_company_id);
  IF s IS NULL THEN RETURN false; END IF;
  SELECT agent_quota INTO quota FROM public.plans WHERE id = s.plan_id;
  IF quota IS NULL THEN RETURN true; END IF;
  SELECT count(*) INTO current_count FROM public.employees WHERE company_id = _company_id AND is_active = true;
  RETURN current_count < quota;
END $$;

CREATE OR REPLACE FUNCTION public.get_company_agent_limits(_company_id uuid)
RETURNS TABLE(used integer, quota integer) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.subscriptions; q integer; c integer;
BEGIN
  SELECT * INTO s FROM public.get_company_active_subscription(_company_id);
  SELECT count(*) INTO c FROM public.employees WHERE company_id = _company_id AND is_active = true;
  IF s IS NULL THEN RETURN QUERY SELECT c, 0;
  ELSE SELECT agent_quota INTO q FROM public.plans WHERE id = s.plan_id; RETURN QUERY SELECT c, q;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_agent_quota()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.subscriptions; quota integer; current_count integer;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.is_active = false THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.is_active = false THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_active = true AND NEW.is_active = true THEN RETURN NEW; END IF;
  SELECT * INTO s FROM public.get_company_active_subscription(NEW.company_id);
  IF s IS NULL THEN RAISE EXCEPTION 'Company has no active plan. Buy a plan before adding employees.' USING ERRCODE = 'check_violation'; END IF;
  SELECT agent_quota INTO quota FROM public.plans WHERE id = s.plan_id;
  IF quota IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO current_count FROM public.employees
    WHERE company_id = NEW.company_id AND is_active = true AND (TG_OP = 'INSERT' OR id <> NEW.id);
  IF current_count >= quota THEN
    RAISE EXCEPTION 'Agent limit reached for your plan (% allowed). Upgrade your plan to add more agents.', quota USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_enforce_agent_quota BEFORE INSERT OR UPDATE OF is_active ON public.employees FOR EACH ROW EXECUTE FUNCTION public.enforce_agent_quota();

-- ============ SITE CONTENT ============
CREATE TABLE public.site_content (
  id integer PRIMARY KEY DEFAULT 1,
  site_title text NOT NULL DEFAULT 'Zentord — Multi-tenant Voice Support Platform',
  meta_description text NOT NULL DEFAULT 'Zentord lets any company embed a voice support button on their site or app.',
  hero_headline text NOT NULL DEFAULT 'Voice support, on every product.',
  hero_subheadline text NOT NULL DEFAULT 'Register your company, embed one button anywhere, and let an AI hold-assistant chat with customers in their own language while your agents pick up.',
  hero_badge text NOT NULL DEFAULT 'Multi-tenant · AI hold · Free WebRTC',
  pricing_tagline text NOT NULL DEFAULT 'Pay once, use until your validity ends. Cancel any time.',
  privacy_policy text NOT NULL DEFAULT 'Privacy policy goes here.',
  terms_of_service text NOT NULL DEFAULT 'Terms of service go here.',
  contact_us text NOT NULL DEFAULT 'Reach us at support@example.com.',
  footer_text text NOT NULL DEFAULT '© Zentord. All rights reserved.',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_content_singleton CHECK (id = 1)
);
INSERT INTO public.site_content (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads site content" ON public.site_content FOR SELECT USING (true);
CREATE POLICY "Admin updates site content" ON public.site_content FOR UPDATE USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER site_content_set_updated_at BEFORE UPDATE ON public.site_content FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.grant_free_trial_on_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE trial public.plans; existing_id uuid;
BEGIN
  IF NEW.status <> 'approved' THEN RETURN NEW; END IF;
  IF OLD.status = 'approved' THEN RETURN NEW; END IF;
  SELECT * INTO trial FROM public.plans WHERE code = 'free_trial' AND is_active = true LIMIT 1;
  IF trial IS NULL THEN RETURN NEW; END IF;
  SELECT id INTO existing_id FROM public.subscriptions WHERE company_id = NEW.id AND status = 'active' AND expires_at > now() LIMIT 1;
  IF existing_id IS NOT NULL THEN RETURN NEW; END IF;
  INSERT INTO public.subscriptions (company_id, plan_id, status, starts_at, expires_at, used_calls)
  VALUES (NEW.id, trial.id, 'active', now(), now() + (trial.validity_days || ' days')::interval, 0);
  INSERT INTO public.email_outbox (to_email, subject, body) VALUES (
    NEW.contact_email, 'Your company has been approved on Zentord',
    'Hi ' || NEW.name || E',\n\nYour company has been approved. Free trial: ' || trial.call_quota || ' calls, ' || trial.agent_quota || ' agent for ' || trial.validity_days || ' day(s).'
  );
  RETURN NEW;
END $$;
CREATE TRIGGER companies_grant_free_trial AFTER UPDATE OF status ON public.companies FOR EACH ROW EXECUTE FUNCTION public.grant_free_trial_on_approval();

-- ============ EMAIL VERIFICATIONS ============
CREATE TABLE public.email_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  email text NOT NULL,
  display_name text NOT NULL,
  phone text,
  password_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_evf_token ON public.email_verifications(token);
CREATE INDEX idx_evf_email ON public.email_verifications(email);
ALTER TABLE public.email_verifications ENABLE ROW LEVEL SECURITY;

-- ============ GEMINI SETTINGS ============
CREATE TABLE public.gemini_settings (
  id integer PRIMARY KEY DEFAULT 1,
  api_key text,
  reply_model text NOT NULL DEFAULT 'gemini-2.0-flash',
  extract_model text NOT NULL DEFAULT 'gemini-2.0-flash-lite',
  use_env_fallback boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gemini_settings_singleton CHECK (id = 1)
);
INSERT INTO public.gemini_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.gemini_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin reads gemini" ON public.gemini_settings FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin writes gemini" ON public.gemini_settings FOR UPDATE USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ OPENAI SETTINGS ============
CREATE TABLE public.openai_settings (
  id integer PRIMARY KEY DEFAULT 1,
  api_key text,
  reply_model text NOT NULL DEFAULT 'gpt-4o-mini',
  extract_model text NOT NULL DEFAULT 'gpt-4o-mini',
  provider text NOT NULL DEFAULT 'openai',
  lovable_reply_model text NOT NULL DEFAULT 'google/gemini-2.5-flash',
  lovable_extract_model text NOT NULL DEFAULT 'google/gemini-2.5-flash-lite',
  use_env_fallback boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT openai_settings_singleton CHECK (id = 1),
  CONSTRAINT openai_settings_provider_check CHECK (provider IN ('openai','lovable'))
);
INSERT INTO public.openai_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.openai_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read openai settings" ON public.openai_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update openai settings" ON public.openai_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert openai settings" ON public.openai_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));