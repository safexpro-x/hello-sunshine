-- Firebase config storage so admin can update it anytime from the admin panel
CREATE TABLE IF NOT EXISTS public.firebase_settings (
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

-- Admins read
CREATE POLICY "Admin reads firebase settings"
ON public.firebase_settings FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Admins update
CREATE POLICY "Admin updates firebase settings"
ON public.firebase_settings FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Public read of non-secret web config (api keys for Firebase web SDK are public by design)
-- but we expose ONLY through an edge function to keep is_enabled gating server-side.
-- So no public SELECT policy needed.

-- Seed singleton row
INSERT INTO public.firebase_settings (id, is_enabled)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

-- Trigger to auto-update timestamps
DROP TRIGGER IF EXISTS firebase_settings_set_updated_at ON public.firebase_settings;
CREATE TRIGGER firebase_settings_set_updated_at
BEFORE UPDATE ON public.firebase_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();