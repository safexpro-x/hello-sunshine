DROP POLICY IF EXISTS "Public can create call via api_key" ON public.calls;
DROP POLICY IF EXISTS "Public can update their room status" ON public.calls;

CREATE POLICY "Public create call for approved company"
ON public.calls FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.status = 'approved')
);

CREATE POLICY "Public update non-ended call"
ON public.calls FOR UPDATE
USING (status <> 'ended')
WITH CHECK (status IN ('waiting','active','ended'));