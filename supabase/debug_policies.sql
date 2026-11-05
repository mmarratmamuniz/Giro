-- Diagnóstico de políticas ativas
CREATE OR REPLACE FUNCTION public.debug_get_policies()
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER AS $$
    SELECT jsonb_agg(jsonb_build_object(
        'table', tablename,
        'policy', policyname,
        'cmd', cmd,
        'roles', roles,
        'qual', qual
    ))
    FROM pg_policies
    WHERE schemaname = 'public';
$$;

GRANT EXECUTE ON FUNCTION public.debug_get_policies() TO anon, authenticated;
