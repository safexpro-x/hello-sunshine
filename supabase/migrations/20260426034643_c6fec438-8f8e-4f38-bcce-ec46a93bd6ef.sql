-- Domain/Origin whitelist
CREATE TABLE IF NOT EXISTS public.company_domain_whitelist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  domain text NOT NULL,
  label text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, domain)
);

ALTER TABLE public.company_domain_whitelist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages domain whitelist"
ON public.company_domain_whitelist FOR ALL
USING (company_id = public.get_user_company_id(auth.uid()))
WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admin views domain whitelist"
ON public.company_domain_whitelist FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Public reads domain whitelist for gating"
ON public.company_domain_whitelist FOR SELECT
USING (true);

-- Helper: returns true if origin matches (or whitelist empty)
CREATE OR REPLACE FUNCTION public.is_origin_allowed_for_company(_company_id uuid, _origin text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  has_any boolean;
  norm text;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.company_domain_whitelist WHERE company_id = _company_id) INTO has_any;
  IF NOT has_any THEN RETURN true; END IF;
  IF _origin IS NULL OR _origin = '' THEN RETURN false; END IF;
  -- normalize: strip protocol, port, path, lowercase
  norm := lower(regexp_replace(_origin, '^https?://', ''));
  norm := split_part(norm, '/', 1);
  norm := split_part(norm, ':', 1);
  RETURN EXISTS (
    SELECT 1 FROM public.company_domain_whitelist
    WHERE company_id = _company_id
      AND (
        lower(domain) = norm
        OR norm LIKE ('%.' || lower(domain))
      )
  );
END $$;

-- Firebase ↔ Lovable Cloud user mapping
CREATE TABLE IF NOT EXISTS public.firebase_user_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid text NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.firebase_user_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own firebase mapping"
ON public.firebase_user_map FOR SELECT
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));