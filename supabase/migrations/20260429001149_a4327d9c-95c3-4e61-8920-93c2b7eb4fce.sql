
CREATE TABLE IF NOT EXISTS public.gemini_settings (
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

CREATE POLICY "Admin reads gemini" ON public.gemini_settings
FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin writes gemini" ON public.gemini_settings
FOR UPDATE USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
