
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS agent_quota integer;

UPDATE public.plans SET agent_quota = 2,    price_paise = 9900  WHERE code = 'starter';
UPDATE public.plans SET agent_quota = 5,    price_paise = 29900 WHERE code = 'growth';
UPDATE public.plans SET agent_quota = NULL, price_paise = 49900, call_quota = NULL WHERE code = 'unlimited';

CREATE OR REPLACE FUNCTION public.can_company_add_agent(_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.subscriptions;
  quota integer;
  current_count integer;
BEGIN
  SELECT * INTO s FROM public.get_company_active_subscription(_company_id);
  IF s IS NULL THEN RETURN false; END IF;
  SELECT agent_quota INTO quota FROM public.plans WHERE id = s.plan_id;
  IF quota IS NULL THEN RETURN true; END IF; -- unlimited
  SELECT count(*) INTO current_count FROM public.employees
    WHERE company_id = _company_id AND is_active = true;
  RETURN current_count < quota;
END $$;

CREATE OR REPLACE FUNCTION public.get_company_agent_limits(_company_id uuid)
RETURNS TABLE(used integer, quota integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE s public.subscriptions; q integer; c integer;
BEGIN
  SELECT * INTO s FROM public.get_company_active_subscription(_company_id);
  SELECT count(*) INTO c FROM public.employees
    WHERE company_id = _company_id AND is_active = true;
  IF s IS NULL THEN
    RETURN QUERY SELECT c, 0;
  ELSE
    SELECT agent_quota INTO q FROM public.plans WHERE id = s.plan_id;
    RETURN QUERY SELECT c, q;
  END IF;
END $$;
