CREATE OR REPLACE FUNCTION public.grant_free_trial_on_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  trial public.plans;
  existing_id uuid;
BEGIN
  IF NEW.status <> 'approved' THEN RETURN NEW; END IF;
  IF OLD.status = 'approved' THEN RETURN NEW; END IF;
  SELECT * INTO trial FROM public.plans WHERE code = 'free_trial' AND is_active = true LIMIT 1;
  IF trial IS NULL THEN RETURN NEW; END IF;
  SELECT id INTO existing_id FROM public.subscriptions
    WHERE company_id = NEW.id AND status = 'active' AND expires_at > now() LIMIT 1;
  IF existing_id IS NOT NULL THEN RETURN NEW; END IF;
  INSERT INTO public.subscriptions (company_id, plan_id, status, starts_at, expires_at, used_calls)
  VALUES (NEW.id, trial.id, 'active', now(), now() + (trial.validity_days || ' days')::interval, 0);
  INSERT INTO public.email_outbox (to_email, subject, body)
  VALUES (
    NEW.contact_email,
    'Your company has been approved on Zentord',
    'Hi ' || NEW.name || E',\n\nGood news — your company has been approved. You now have a free trial with ' ||
    trial.call_quota || ' calls and ' || trial.agent_quota || ' agent for ' || trial.validity_days ||
    ' day' || CASE WHEN trial.validity_days > 1 THEN 's' ELSE '' END ||
    E'.\n\nLog in: https://chat-bridge-aid.lovable.app/company\n\n— Zentord'
  );
  RETURN NEW;
END $function$;