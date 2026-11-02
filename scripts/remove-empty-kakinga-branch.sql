\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  old_branch constant uuid := '5bfe50a7-e316-497f-ac0e-222653381334';
  new_branch constant uuid := '48efcb7b-0338-4a00-82f5-b58873c6661d';
  old_user constant uuid := '1d70ee24-28e7-4a63-a041-2b3b5f9303ee';
  tenant constant uuid := '5f894b67-14b2-4539-873c-56789a464b3c';
  r record;
  n bigint;
  saved_branch jsonb;
  saved_subscription jsonb;
BEGIN
  SELECT to_jsonb(b) INTO saved_branch FROM branches b WHERE b.id = old_branch AND b.tenant_id = tenant AND b.name = 'KAKINGA' FOR UPDATE;
  IF saved_branch IS NULL THEN RAISE EXCEPTION 'Old branch identity changed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM branches WHERE id = new_branch AND tenant_id = tenant AND name = 'Kakinga B') THEN RAISE EXCEPTION 'Target branch not found'; END IF;
  IF (SELECT count(*) FROM loans WHERE branch_id = new_branch) <> 221 OR (SELECT sum(balance) FROM loans WHERE branch_id = new_branch) <> 61401000 THEN RAISE EXCEPTION 'Imported loans changed; review before removing branch'; END IF;
  IF (SELECT count(*) FROM users WHERE branch_id = old_branch) <> 1 OR NOT EXISTS (SELECT 1 FROM users WHERE id = old_user AND branch_id = old_branch AND status = 'ACTIVE') THEN RAISE EXCEPTION 'Old account changed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = 'ebc77758-7b35-4ffb-9091-398cefdea7f2' AND branch_id = new_branch AND status = 'ACTIVE') THEN RAISE EXCEPTION 'Target manager account unavailable'; END IF;
  SELECT to_jsonb(s) INTO saved_subscription FROM branch_subscriptions s WHERE s.branch_id = old_branch AND s.status = 'TRIAL';
  IF saved_subscription IS NULL THEN RAISE EXCEPTION 'Old subscription changed'; END IF;
  FOR r IN SELECT c.table_schema,c.table_name FROM information_schema.columns c JOIN information_schema.tables t USING (table_schema,table_name) WHERE c.table_schema = 'public' AND c.column_name = 'branch_id' AND t.table_type = 'BASE TABLE' AND c.table_name NOT IN ('users','branch_subscriptions') LOOP
    EXECUTE format('SELECT count(*) FROM %I.%I WHERE branch_id = $1',r.table_schema,r.table_name) INTO n USING old_branch;
    IF n <> 0 THEN RAISE EXCEPTION 'Old branch contains % records in %',n,r.table_name; END IF;
  END LOOP;
  INSERT INTO audit_logs (id, tenant_id, action, entity_type, entity_id, old_value, new_value, created_at)
  VALUES (gen_random_uuid(), tenant, 'branch.empty_removed', 'branch', old_branch::text,
    jsonb_build_object('branch',saved_branch,'subscription',saved_subscription,'oldUserId',old_user),
    jsonb_build_object('reason','Duplicate old KAKINGA branch removed at owner request','retainedBranchId',new_branch,'oldUserStatus','INACTIVE'), now());
  UPDATE auth_sessions SET revoked_at = now() WHERE user_id = old_user AND revoked_at IS NULL;
  UPDATE users SET status = 'INACTIVE', branch_id = NULL, updated_at = now() WHERE id = old_user AND branch_id = old_branch;
  DELETE FROM branches WHERE id = old_branch;
  IF NOT FOUND THEN RAISE EXCEPTION 'Branch not removed'; END IF;
END $$;
\if :apply
COMMIT;
\else
ROLLBACK;
\endif
