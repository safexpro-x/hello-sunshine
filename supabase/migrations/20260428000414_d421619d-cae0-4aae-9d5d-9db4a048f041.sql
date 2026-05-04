
-- Add phone + email verification flag to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

-- Pending email verifications (custom signup flow via own SMTP)
CREATE TABLE IF NOT EXISTS public.email_verifications (
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
CREATE INDEX IF NOT EXISTS idx_evf_token ON public.email_verifications(token);
CREATE INDEX IF NOT EXISTS idx_evf_email ON public.email_verifications(email);
ALTER TABLE public.email_verifications ENABLE ROW LEVEL SECURITY;
-- No public policies — only service role (edge functions) reads/writes.

-- SSL toggle for SMTP (separate from STARTTLS / use_tls)
ALTER TABLE public.smtp_settings
  ADD COLUMN IF NOT EXISTS use_ssl boolean NOT NULL DEFAULT false;

-- Site headline/branding header text already in site_content (hero_headline) — also add a footer + meta description
ALTER TABLE public.site_content
  ADD COLUMN IF NOT EXISTS site_title text NOT NULL DEFAULT 'Zentord — Multi-tenant Voice Support Platform',
  ADD COLUMN IF NOT EXISTS meta_description text NOT NULL DEFAULT 'Zentord lets any company embed a voice support button on their site or app. AI hold-assistant talks to customers in their language until your agent picks up.',
  ADD COLUMN IF NOT EXISTS footer_text text NOT NULL DEFAULT '© Zentord. All rights reserved.';

-- Update handle_new_user to also set phone from raw_user_meta_data
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, display_name, phone, email_verified_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NULLIF(NEW.raw_user_meta_data->>'phone', ''),
    -- If created via our verify-email function, raw_user_meta_data.email_verified='true'
    CASE WHEN COALESCE(NEW.raw_user_meta_data->>'email_verified', 'false') = 'true' THEN now() ELSE NULL END
  )
  ON CONFLICT (user_id) DO UPDATE SET
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
    email_verified_at = COALESCE(EXCLUDED.email_verified_at, public.profiles.email_verified_at);

  IF NEW.email = 'admin@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.employees SET user_id = NEW.id WHERE email = NEW.email AND user_id IS NULL;
  IF FOUND THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'employee')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
