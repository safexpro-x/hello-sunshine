-- 1) SMTP settings (single row)
CREATE TABLE IF NOT EXISTS public.smtp_settings (
  id integer PRIMARY KEY DEFAULT 1,
  host text,
  port integer DEFAULT 587,
  username text,
  password text,
  from_email text,
  from_name text DEFAULT 'Zentord',
  use_tls boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT smtp_singleton CHECK (id = 1)
);
INSERT INTO public.smtp_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE public.smtp_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin reads smtp" ON public.smtp_settings FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin writes smtp" ON public.smtp_settings FOR UPDATE USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2) Company IP whitelist (multi)
CREATE TABLE IF NOT EXISTS public.company_ip_whitelist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ip_address text NOT NULL,
  label text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, ip_address)
);
ALTER TABLE public.company_ip_whitelist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages whitelist" ON public.company_ip_whitelist FOR ALL
  USING (company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Admin views whitelist" ON public.company_ip_whitelist FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Public can read for gating (no sensitive data — just IPs already provided by company)
CREATE POLICY "Public reads whitelist for gating" ON public.company_ip_whitelist FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.is_ip_allowed_for_company(_company_id uuid, _ip text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE has_any boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.company_ip_whitelist WHERE company_id = _company_id) INTO has_any;
  IF NOT has_any THEN RETURN true; END IF; -- empty = open
  IF _ip IS NULL OR _ip = '' THEN RETURN false; END IF;
  RETURN EXISTS (SELECT 1 FROM public.company_ip_whitelist WHERE company_id = _company_id AND ip_address = _ip);
END $$;

-- 3) Password reset tokens
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
-- Server-side only via service role; no public policies needed.
CREATE INDEX IF NOT EXISTS idx_prt_token ON public.password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_prt_email ON public.password_reset_tokens(email);