ALTER TABLE public.openai_settings
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'openai',
  ADD COLUMN IF NOT EXISTS lovable_reply_model text NOT NULL DEFAULT 'google/gemini-2.5-flash',
  ADD COLUMN IF NOT EXISTS lovable_extract_model text NOT NULL DEFAULT 'google/gemini-2.5-flash-lite';

ALTER TABLE public.openai_settings
  DROP CONSTRAINT IF EXISTS openai_settings_provider_check;

ALTER TABLE public.openai_settings
  ADD CONSTRAINT openai_settings_provider_check
  CHECK (provider IN ('openai','lovable'));