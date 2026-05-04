-- Add OpenAI settings table (separate from gemini for clean migration path)
CREATE TABLE IF NOT EXISTS public.openai_settings (
  id integer PRIMARY KEY DEFAULT 1,
  api_key text,
  reply_model text NOT NULL DEFAULT 'gpt-4o-mini',
  extract_model text NOT NULL DEFAULT 'gpt-4o-mini',
  use_env_fallback boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT openai_settings_singleton CHECK (id = 1)
);

INSERT INTO public.openai_settings (id, api_key, reply_model, extract_model, use_env_fallback)
VALUES (1, NULL, 'gpt-4o-mini', 'gpt-4o-mini', true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.openai_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read openai settings"
ON public.openai_settings FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update openai settings"
ON public.openai_settings FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert openai settings"
ON public.openai_settings FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));