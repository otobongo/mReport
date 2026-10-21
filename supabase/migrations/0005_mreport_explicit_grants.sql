-- ============================================================================
-- 0005_mreport_explicit_grants.sql — grant Data API access to mreport_* tables
--
-- WHY THIS FILE EXISTS:
--   Until now Supabase's default privileges gave anon, authenticated and
--   service_role every table privilege on each new table in `public` (and
--   EXECUTE on each new function). From 30 October 2026 Supabase stops doing
--   that automatically. Migrations 0001 to 0004 contain no GRANT statements,
--   so a database rebuilt from them after that date (new project, preview
--   branch, `supabase db reset`) would leave every mreport_* table
--   unreachable through supabase-js / PostgREST, including the service-role
--   admin client in src/lib/supabase/admin.ts.
--
-- WHAT IT DOES:
--   Reproduces exactly what the old defaults gave: full table privileges and
--   EXECUTE on the helper functions, for anon, authenticated and
--   service_role. Nothing is tightened. Row level security (0001, 0002) still
--   decides which rows each role can see; these grants only make the tables
--   reachable.
--
-- SAFE ON THE LIVE DATABASE:
--   GRANT is idempotent. The live tables already hold these privileges, so
--   running this there changes nothing.
--
-- WHAT IT DOES NOT DO:
--   Every object is named explicitly. There is no ALL TABLES / ALL FUNCTIONS
--   IN SCHEMA grant, because this project also holds core_* and cem_* tables
--   from other apps and a bulk grant would change them.
--   There are no sequences to grant: every id column is a uuid with
--   gen_random_uuid(), and the two enums need no grant.
--
-- RULE GOING FORWARD:
--   Every migration that creates a table or view in `public` grants it in the
--   same file. tests/migration-grants.test.ts fails if one does not.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tables (created in 0001_mreport_init.sql)
-- ----------------------------------------------------------------------------
grant select, insert, update, delete on public.mreport_regions         to anon, authenticated, service_role;
grant select, insert, update, delete on public.mreport_parishes        to anon, authenticated, service_role;
grant select, insert, update, delete on public.mreport_user_scopes     to anon, authenticated, service_role;
grant select, insert, update, delete on public.mreport_reports         to anon, authenticated, service_role;
grant select, insert, update, delete on public.mreport_report_lines    to anon, authenticated, service_role;
grant select, insert, update, delete on public.mreport_audit_log       to anon, authenticated, service_role;
grant select, insert, update, delete on public.mreport_tenant_settings to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Functions (created in 0004_mreport_storage_bucket.sql)
-- Exact signatures, so no other overload or function is touched.
-- ----------------------------------------------------------------------------
grant execute on function public.mreport_object_tenant_id(text)        to anon, authenticated, service_role;
grant execute on function public.mreport_user_is_tenant_member(uuid)   to anon, authenticated, service_role;
