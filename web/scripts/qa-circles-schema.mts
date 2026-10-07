// Generates reviewed SQL only. This script has no database, network or secret access.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const QA_CIRCLES_PROJECT_REF = "gtfgmlfjvahslxhxomac";
export const QA_CIRCLES_RECIPE_FILES = [
  "circles_testnet_campaigns.sql", "campaign_donors.sql", "campaign_updates.sql",
] as const;
export const QA_CIRCLES_TABLES = [
  "circles_testnet_campaigns", "campaign_donors", "campaign_update_subscriptions",
  "campaign_updates", "campaign_update_outbox",
] as const;
export const QA_CIRCLES_FUNCTIONS = [
  "guard_circles_testnet_campaign_mapping()",
  "campaign_updates_subscribe(text,text,text,uuid,text,text,boolean)",
  "campaign_updates_unsubscribe(text,text,text,uuid)",
  "campaign_updates_publish(text,text,text,uuid,uuid,text,text,text,text)",
  "campaign_updates_claim(text,text,text,uuid,text,integer)",
  "campaign_updates_finish(uuid,uuid,text,uuid,timestamptz)",
] as const;
const sequence = "campaign_donors_id_seq";
const indexes = [
  { name: "circles_testnet_campaigns_active_slug_idx", table: QA_CIRCLES_TABLES[0], keys: ["network", "contract_id", "circle_slug"], unique: true, predicate: "(archived_at IS NULL)" },
  { name: "campaign_donors_feed_idx", table: QA_CIRCLES_TABLES[1], keys: ["network", "contract_id", "campaign_id", "id"], sortOptions: [0, 0, 0, 3], unique: false, predicate: null },
  { name: "campaign_donors_owner_idx", table: QA_CIRCLES_TABLES[1], keys: ["owner_id"], unique: false, predicate: null },
  { name: "campaign_update_subscriptions_scope_idx", table: QA_CIRCLES_TABLES[2], keys: ["network", "contract_id", "campaign_id"], unique: false, predicate: "active" },
  { name: "campaign_update_subscriptions_user_idx", table: QA_CIRCLES_TABLES[2], keys: ["user_id"], unique: false, predicate: null },
  { name: "campaign_updates_scope_idx", table: QA_CIRCLES_TABLES[3], keys: ["network", "contract_id", "campaign_id", "published_at"], sortOptions: [0, 0, 0, 3], unique: false, predicate: null },
  { name: "campaign_updates_publisher_idx", table: QA_CIRCLES_TABLES[3], keys: ["published_by"], unique: false, predicate: null },
  { name: "campaign_update_outbox_retry_idx", table: QA_CIRCLES_TABLES[4], keys: ["update_id", "status", "retry_after"], unique: false, predicate: null },
  { name: "campaign_update_outbox_subscription_idx", table: QA_CIRCLES_TABLES[4], keys: ["subscription_id"], unique: false, predicate: null },
  { name: "campaign_update_outbox_user_idx", table: QA_CIRCLES_TABLES[4], keys: ["user_id"], unique: false, predicate: null },
] as const;
type Recipe = { name: string; sql: string };
type Statement = { start: number; end: number; sql: string };

// Dollar-quoted PL/pgSQL is opaque here, so its BEGIN and semicolons survive.
export function sqlStatements(source: string): Statement[] {
  const statements: Statement[] = [];
  let start: number | null = null;
  for (let i = 0; i < source.length;) {
    if (/\s/.test(source[i])) { i++; continue; }
    if (source.startsWith("--", i)) {
      const end = source.indexOf("\n", i + 2);
      i = end < 0 ? source.length : end + 1;
      continue;
    }
    if (source.startsWith("/*", i)) {
      let depth = 1;
      i += 2;
      while (i < source.length && depth) {
        if (source.startsWith("/*", i)) { depth++; i += 2; }
        else if (source.startsWith("*/", i)) { depth--; i += 2; }
        else i++;
      }
      if (depth) throw new Error("Unterminated SQL block comment");
      continue;
    }
    if (start === null) start = i;
    if (source[i] === "'" || source[i] === '"') {
      const quote = source[i];
      const escape = quote === "'" && /[eE]/.test(source[i - 1] ?? "") && !/[\w$]/.test(source[i - 2] ?? "");
      let closed = false;
      i++;
      while (i < source.length) {
        if (escape && source[i] === "\\") { i += 2; continue; }
        if (source[i] === quote) {
          if (source[i + 1] === quote) { i += 2; continue; }
          i++; closed = true; break;
        }
        i++;
      }
      if (!closed) throw new Error("Unterminated SQL quoted string or identifier");
      continue;
    }
    if (source[i] === "$") {
      const delimiter = source.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/)?.[0];
      if (delimiter) {
        const end = source.indexOf(delimiter, i + delimiter.length);
        if (end < 0) throw new Error("Unterminated SQL dollar quote");
        i = end + delimiter.length;
        continue;
      }
    }
    if (source[i] === ";") {
      statements.push({ start, end: i + 1, sql: source.slice(start, i + 1) });
      start = null;
    }
    i++;
  }
  if (start !== null) throw new Error("SQL statement is missing its terminating semicolon");
  return statements;
}

function isStandalone(source: string, statement: Statement): boolean {
  const lineStart = source.lastIndexOf("\n", statement.start - 1) + 1;
  const nextLine = source.indexOf("\n", statement.end);
  return source.slice(lineStart, nextLine < 0 ? source.length : nextLine).trim() === statement.sql.trim();
}

export function stripRecipeTransaction(source: string, name: string): string {
  const sql = source.replace(/\r\n?/g, "\n");
  const statements = sqlStatements(sql);
  const first = statements[0], last = statements.at(-1);
  if (!first || !last || !/^begin\s*;$/i.test(first.sql) || !/^commit\s*;$/i.test(last.sql)
    || !isStandalone(sql, first) || !isStandalone(sql, last))
    throw new Error(`${name}: expected exactly one standalone BEGIN/COMMIT wrapper`);
  for (const statement of statements.slice(1, -1)) {
    if (/^(?:begin|commit|rollback|end|abort|savepoint|release\s+savepoint|start\s+transaction)\b/i.test(statement.sql))
      throw new Error(`${name}: unexpected inner transaction command`);
    if (!/^(?:create\s+(?:table|(?:unique\s+)?index|or\s+replace\s+function|policy|trigger)|alter\s+table|revoke|grant|drop\s+(?:policy|trigger))\b/i.test(statement.sql))
      throw new Error(`${name}: unreviewed top-level SQL command`);
    if (/\bconcurrently\b/i.test(statement.sql)) throw new Error(`${name}: nontransactional index command`);
    if (/\b(?:from|into|update|table|truncate)\s+(?:(?:"?public"?)\s*\.\s*)?"?wallets"?\b/i.test(statement.sql))
      throw new Error(`${name}: wallet table is outside this installation`);
  }
  // Delete only the two statement spans, preserving every other source byte after newline normalization.
  return (sql.slice(0, first.start) + sql.slice(first.end, last.start) + sql.slice(last.end)).trim();
}

export function readQaCirclesRecipes(): Recipe[] {
  return QA_CIRCLES_RECIPE_FILES.map(name => ({ name,
    sql: readFileSync(new URL(`../supabase/${name}`, import.meta.url), "utf8"),
  }));
}

const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sqlArray = (values: readonly string[]) => `ARRAY[${values.map(literal).join(", ")}]::text[]`;

function preflight(): string {
  return `DO $qa_preflight$
DECLARE
  target_name text;
  role_name text;
BEGIN
  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'QA schema preflight: auth.users is missing';
  END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = role_name) THEN
      RAISE EXCEPTION 'QA schema preflight: required role % is missing', role_name;
    END IF;
    IF NOT has_schema_privilege(role_name, 'public', 'USAGE') THEN
      RAISE EXCEPTION 'QA schema preflight: role % lacks public schema USAGE', role_name;
    END IF;
  END LOOP;
  FOREACH target_name IN ARRAY ${sqlArray([...QA_CIRCLES_TABLES, sequence, ...indexes.map(index => index.name)])} LOOP
    IF to_regclass(format('public.%I', target_name)) IS NOT NULL THEN
      RAISE EXCEPTION 'QA schema preflight: target object public.% already exists; inspect instead of overwriting', target_name;
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY (${sqlArray(QA_CIRCLES_FUNCTIONS.map(signature => signature.split("(")[0]))})
  ) THEN
    RAISE EXCEPTION 'QA schema preflight: target function already exists; inspect instead of replacing';
  END IF;
END
$qa_preflight$;`;
}

function verification(): string {
  // pg_get_indexdef(oid, column, true) omits sort options. indoption is
  // zero-based: ASC/default NULLS LAST = 0; DESC/default NULLS FIRST = 3.
  const indexRows = indexes.map(index => {
    const sortOptions = "sortOptions" in index ? index.sortOptions : index.keys.map(() => 0);
    return `(${literal(index.name)}, ${literal(index.table)}, ${sqlArray(index.keys)}, ARRAY[${sortOptions.join(", ")}]::smallint[], ${index.unique}, ${index.predicate === null ? "NULL::text" : literal(index.predicate)})`;
  }).join(",\n        ");
  return `DO $qa_verify$
DECLARE
  target_name text;
  role_name text;
  privilege_name text;
  signature text;
  target_oid oid;
  service_oid oid := (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'service_role');
  client_oids oid[] := ARRAY[(SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'anon'), (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'authenticated')];
  expected boolean;
  target_count bigint;
  policy_name text;
  index_spec record;
  table_privileges text[] := ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'];
BEGIN
  IF current_setting('server_version_num')::integer >= 170000 THEN
    table_privileges := table_privileges || ARRAY['MAINTAIN'];
  END IF;
  FOREACH target_name IN ARRAY ${sqlArray(QA_CIRCLES_TABLES)} LOOP
    target_oid := to_regclass(format('public.%I', target_name));
    IF target_oid IS NULL OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE oid = target_oid AND relkind = 'r' AND relrowsecurity) THEN
      RAISE EXCEPTION 'QA schema verification: table/RLS mismatch for %', target_name;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = target_oid AND attnum > 0 AND NOT attisdropped AND cardinality(attacl) > 0) THEN
      RAISE EXCEPTION 'QA schema verification: unexpected column ACL for %', target_name;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c, LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
      WHERE c.oid = target_oid AND a.grantee <> c.relowner AND (a.grantee <> service_oid OR a.is_grantable)
    ) THEN
      RAISE EXCEPTION 'QA schema verification: unexpected table grantee/grant option for %', target_name;
    END IF;
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      FOREACH privilege_name IN ARRAY table_privileges LOOP
        expected := role_name = 'service_role' AND (privilege_name = 'SELECT'
          OR (privilege_name = 'INSERT' AND target_name <> 'circles_testnet_campaigns')
          OR (privilege_name = 'UPDATE' AND target_name = ANY (ARRAY['campaign_update_subscriptions','campaign_updates','campaign_update_outbox'])));
        IF has_table_privilege(role_name, target_oid, privilege_name) IS DISTINCT FROM expected
          OR has_table_privilege(role_name, target_oid, privilege_name || ' WITH GRANT OPTION') THEN
          RAISE EXCEPTION 'QA schema verification: table ACL mismatch for % / % / %', target_name, role_name, privilege_name;
        END IF;
        IF privilege_name = ANY (ARRAY['SELECT','INSERT','UPDATE','REFERENCES'])
          AND has_any_column_privilege(role_name, target_oid, privilege_name) IS DISTINCT FROM expected THEN
          RAISE EXCEPTION 'QA schema verification: effective column ACL mismatch for % / % / %', target_name, role_name, privilege_name;
        END IF;
      END LOOP;
    END LOOP;
    policy_name := CASE target_name
      WHEN 'circles_testnet_campaigns' THEN 'circles_testnet_campaigns_no_client_access'
      WHEN 'campaign_donors' THEN 'campaign_donors_no_client_access'
      ELSE target_name || '_no_client' END;
    IF (SELECT count(*) FROM pg_catalog.pg_policy WHERE polrelid = target_oid) <> 1 OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid = target_oid AND polname = policy_name
        AND NOT polpermissive AND polcmd = '*' AND cardinality(polroles) = 2 AND polroles @> client_oids
        AND pg_get_expr(polqual, polrelid) = 'false' AND pg_get_expr(polwithcheck, polrelid) = 'false'
    ) THEN
      RAISE EXCEPTION 'QA schema verification: restrictive client policy mismatch for %', target_name;
    END IF;
    EXECUTE format('SELECT count(*) FROM public.%I', target_name) INTO target_count;
    IF target_count <> 0 THEN RAISE EXCEPTION 'QA schema verification: % must remain empty during schema installation', target_name; END IF;
  END LOOP;

  target_oid := to_regclass('public.campaign_donors_id_seq');
  IF target_oid IS NULL OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE oid = target_oid AND relkind = 'S')
    OR pg_get_serial_sequence('public.campaign_donors', 'id') IS DISTINCT FROM 'public.campaign_donors_id_seq'
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.campaign_donors'::regclass AND attname = 'id' AND attidentity = 'a') THEN
    RAISE EXCEPTION 'QA schema verification: donor identity sequence mismatch';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c, LATERAL aclexplode(coalesce(c.relacl, acldefault('S', c.relowner))) a
    WHERE c.oid = target_oid AND a.grantee <> c.relowner AND (a.grantee <> service_oid OR a.is_grantable)
  ) THEN RAISE EXCEPTION 'QA schema verification: unexpected sequence ACL'; END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    FOREACH privilege_name IN ARRAY ARRAY['USAGE','SELECT','UPDATE'] LOOP
      expected := role_name = 'service_role' AND privilege_name <> 'UPDATE';
      IF has_sequence_privilege(role_name, target_oid, privilege_name) IS DISTINCT FROM expected
        OR has_sequence_privilege(role_name, target_oid, privilege_name || ' WITH GRANT OPTION') THEN
        RAISE EXCEPTION 'QA schema verification: sequence ACL mismatch for % / %', role_name, privilege_name;
      END IF;
    END LOOP;
  END LOOP;

  FOREACH signature IN ARRAY ${sqlArray(QA_CIRCLES_FUNCTIONS)} LOOP
    target_oid := to_regprocedure('public.' || signature);
    IF target_oid IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc WHERE oid = target_oid AND NOT prosecdef AND prokind = 'f'
        AND proconfig = ARRAY['search_path=""']::text[]
    ) THEN RAISE EXCEPTION 'QA schema verification: invoker/search_path mismatch for %', signature; END IF;
    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      WHERE p.oid = target_oid AND a.grantee <> p.proowner AND (a.grantee <> service_oid OR a.is_grantable)
    ) THEN RAISE EXCEPTION 'QA schema verification: unexpected function ACL for %', signature; END IF;
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      expected := role_name = 'service_role' AND signature <> 'guard_circles_testnet_campaign_mapping()';
      IF has_function_privilege(role_name, target_oid, 'EXECUTE') IS DISTINCT FROM expected
        OR has_function_privilege(role_name, target_oid, 'EXECUTE WITH GRANT OPTION') THEN
        RAISE EXCEPTION 'QA schema verification: function ACL mismatch for % / %', signature, role_name;
      END IF;
    END LOOP;
  END LOOP;
  IF (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY (${sqlArray(QA_CIRCLES_FUNCTIONS.map(signature => signature.split("(")[0]))})) <> 6 THEN
    RAISE EXCEPTION 'QA schema verification: unexpected function overload';
  END IF;

  IF (SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgrelid = 'public.circles_testnet_campaigns'::regclass AND NOT tgisinternal) <> 1
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid = 'public.circles_testnet_campaigns'::regclass
      AND tgname = 'circles_testnet_campaigns_immutable' AND NOT tgisinternal AND tgenabled = 'O' AND tgtype = 27 AND tgnargs = 0
      AND tgfoid = 'public.guard_circles_testnet_campaign_mapping()'::regprocedure) THEN
    RAISE EXCEPTION 'QA schema verification: immutable mapping trigger mismatch';
  END IF;
  FOR index_spec IN SELECT * FROM (VALUES
        ${indexRows}
    ) AS expected_index(index_name, table_name, keys, sort_options, is_unique, predicate) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid = i.indexrelid
        JOIN pg_catalog.pg_am am ON am.oid = c.relam
      WHERE i.indexrelid = to_regclass(format('public.%I', index_spec.index_name))
        AND i.indrelid = to_regclass(format('public.%I', index_spec.table_name))
        AND i.indisvalid AND i.indisready AND am.amname = 'btree' AND i.indisunique = index_spec.is_unique
        AND i.indnatts = cardinality(index_spec.keys) AND i.indnkeyatts = cardinality(index_spec.keys) AND i.indexprs IS NULL
        AND ARRAY(SELECT pg_get_indexdef(i.indexrelid, key_number, true) FROM generate_series(1, i.indnkeyatts) key_number) = index_spec.keys
        AND ARRAY(SELECT i.indoption[key_number - 1] FROM generate_series(1, i.indnkeyatts) key_number) = index_spec.sort_options
        AND pg_get_expr(i.indpred, i.indrelid) IS NOT DISTINCT FROM index_spec.predicate
    ) THEN RAISE EXCEPTION 'QA schema verification: index definition mismatch for %', index_spec.index_name; END IF;
  END LOOP;
END
$qa_verify$;`;
}

export function generateQaCirclesSchema(options: { projectRef: string; recipes?: Recipe[] }): string {
  if (options.projectRef !== QA_CIRCLES_PROJECT_REF) throw new Error("The explicit reviewed Salapi project reference is required");
  const recipes = options.recipes ?? readQaCirclesRecipes();
  if (recipes.length !== QA_CIRCLES_RECIPE_FILES.length || recipes.some((recipe, index) => recipe.name !== QA_CIRCLES_RECIPE_FILES[index]))
    throw new Error("Exactly the three reviewed recipes, in their reviewed order, are required");
  const bodies = recipes.map(recipe => {
    const hash = createHash("sha256").update(recipe.sql).digest("hex");
    return `-- Recipe: ${recipe.name}; sha256=${hash}\n${stripRecipeTransaction(recipe.sql, recipe.name)}`;
  });
  return `-- Reviewed Salapi Circles QA schema installation. Target project: ${options.projectRef}.
-- Generate only; verify the target dashboard before executing this fresh install.
-- No wallet provisioning, campaign mapping insertion, contract deployment or email dispatch.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';
SELECT pg_advisory_xact_lock(hashtextextended('salapi/qa-circles-schema/v1', 0));
${preflight()}

${bodies.join("\n\n")}

${verification()}

-- Nonsecret summary. The transaction commits only after every assertion succeeds.
SELECT 'salapi-circles-qa-schema-v1' AS verified_schema,
  current_database() AS database_name, current_user AS executed_as,
  5 AS verified_tables, 6 AS verified_functions, 10 AS verified_secondary_indexes,
  0 AS provisioned_campaign_mappings;
COMMIT;
`;
}

export function qaCirclesSchemaCli(args: string[]): string {
  if (args.length !== 2 || args[0] !== "--project-ref")
    throw new Error(`Usage: node --experimental-strip-types scripts/qa-circles-schema.mts --project-ref ${QA_CIRCLES_PROJECT_REF}`);
  return generateQaCirclesSchema({ projectRef: args[1] });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(qaCirclesSchemaCli(process.argv.slice(2)));
}
