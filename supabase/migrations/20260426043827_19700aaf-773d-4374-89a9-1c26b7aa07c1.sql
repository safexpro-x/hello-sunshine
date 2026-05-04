
CREATE OR REPLACE FUNCTION public.enforce_agent_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.subscriptions;
  quota integer;
  current_count integer;
BEGIN
  -- Only check on insert of active row, or on update activating it
  IF TG_OP = 'INSERT' AND NEW.is_active = false THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.is_active = false THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_active = true AND NEW.is_active = true THEN RETURN NEW; END IF;

  SELECT * INTO s FROM public.get_company_active_subscription(NEW.company_id);
  IF s IS NULL THEN
    RAISE EXCEPTION 'Company has no active plan. Buy a plan before adding employees.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT agent_quota INTO quota FROM public.plans WHERE id = s.plan_id;
  IF quota IS NULL THEN RETURN NEW; END IF; -- unlimited

  SELECT count(*) INTO current_count FROM public.employees
    WHERE company_id = NEW.company_id AND is_active = true
      AND (TG_OP = 'INSERT' OR id <> NEW.id);
  IF current_count >= quota THEN
    RAISE EXCEPTION 'Agent limit reached for your plan (% allowed). Upgrade your plan to add more agents.', quota
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_agent_quota ON public.employees;
CREATE TRIGGER trg_enforce_agent_quota
BEFORE INSERT OR UPDATE OF is_active ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.enforce_agent_quota();
