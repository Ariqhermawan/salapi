import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { QA_CIRCLES_PROJECT_REF, QA_CIRCLES_RECIPE_FILES, QA_CIRCLES_TABLES, QA_CIRCLES_FUNCTIONS,
  sqlStatements, stripRecipeTransaction, generateQaCirclesSchema, qaCirclesSchemaCli, readQaCirclesRecipes } from "./qa-circles-schema.mts";

const recipes = readQaCirclesRecipes();
const bundle = generateQaCirclesSchema({ projectRef: QA_CIRCLES_PROJECT_REF, recipes });

test("combines all reviewed recipes into one transaction while preserving their bodies", () => {
  const statements = sqlStatements(bundle);
  assert.equal(statements.filter(statement => /^BEGIN\s*;$/i.test(statement.sql)).length, 1);
  assert.equal(statements.filter(statement => /^COMMIT\s*;$/i.test(statement.sql)).length, 1);
  assert.equal(statements[0].sql, "BEGIN;");
  assert.equal(statements.at(-1)!.sql, "COMMIT;");
  for (const recipe of recipes) {
    assert.ok(bundle.includes(stripRecipeTransaction(recipe.sql, recipe.name)));
    assert.ok(bundle.includes(`sha256=${createHash("sha256").update(recipe.sql).digest("hex")}`));
  }
  assert.ok(bundle.indexOf("$qa_preflight$") < bundle.indexOf("create table"));
  assert.ok(bundle.lastIndexOf("$qa_verify$") > bundle.lastIndexOf("grant execute"));
});

test("wrapper stripping understands comments, quoted semicolons and tagged function bodies", () => {
  const body = `-- keep this header\nBEGIN;\nCREATE OR REPLACE FUNCTION public.example() RETURNS void AS $fn$\nBEGIN\n  PERFORM 'begin; -- not a comment';\n  /* keep this function comment */\nEND\n$fn$ LANGUAGE plpgsql;\n-- keep this footer\nCOMMIT;\n`;
  const result = stripRecipeTransaction(body.replaceAll("\n", "\r\n"), "fixture");
  assert.equal(result, "-- keep this header\n\nCREATE OR REPLACE FUNCTION public.example() RETURNS void AS $fn$\nBEGIN\n  PERFORM 'begin; -- not a comment';\n  /* keep this function comment */\nEND\n$fn$ LANGUAGE plpgsql;\n-- keep this footer");
  assert.equal(sqlStatements(body).length, 3);
  assert.equal(sqlStatements("/* nested /* inner */ comment */ SELECT E'can\\'t;'; -- end").length, 1);
  assert.equal(sqlStatements('SELECT "semi;colon", \'it\'\'s;quoted\';').length, 1);
});

test("rejects missing, inline, repeated and extra transaction wrappers instead of guessing", () => {
  for (const source of [
    "CREATE TABLE public.example(id int);", "BEGIN;\nCREATE TABLE public.example(id int);",
    "BEGIN; CREATE TABLE public.example(id int);\nCOMMIT;",
    "BEGIN;\nCREATE TABLE public.example(id int); COMMIT;",
    "BEGIN;\nBEGIN;\nCREATE TABLE public.example(id int);\nCOMMIT;\nCOMMIT;",
    "BEGIN;\nCREATE TABLE public.example(id int);\nROLLBACK;\nCOMMIT;",
    "BEGIN;\nSAVEPOINT unexpected;\nCOMMIT;", "BEGIN;\nSTART TRANSACTION;\nCOMMIT;",
  ]) assert.throws(() => stripRecipeTransaction(source, "fixture"), /wrapper|transaction/);
});

test("rejects incomplete SQL and unreviewed data mutations or nontransactional commands", () => {
  for (const source of ["SELECT 'unterminated", "/* unterminated", "SELECT $tag$unterminated", "SELECT 1"])
    assert.throws(() => sqlStatements(source), /Unterminated|terminating/);
  for (const command of ["INSERT INTO public.campaign_donors DEFAULT VALUES;", "DELETE FROM public.campaign_updates;",
    "UPDATE public.campaign_updates SET title = 'changed';", "DROP TABLE public.campaign_donors;",
    "CREATE INDEX CONCURRENTLY anything ON public.campaign_updates(id);", "ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;",
    'ALTER TABLE "public"."wallets" ENABLE ROW LEVEL SECURITY;'])
    assert.throws(() => stripRecipeTransaction(`BEGIN;\n${command}\nCOMMIT;`, "fixture"), /unreviewed|nontransactional|wallet/);
});

test("requires the explicit exact project and fixed recipe inventory", () => {
  assert.throws(() => generateQaCirclesSchema({ projectRef: "different-project", recipes }), /Salapi project/);
  assert.throws(() => generateQaCirclesSchema({ projectRef: QA_CIRCLES_PROJECT_REF, recipes: recipes.slice(0, 2) }), /three reviewed/);
  assert.throws(() => generateQaCirclesSchema({ projectRef: QA_CIRCLES_PROJECT_REF, recipes: [...recipes].reverse() }), /three reviewed/);
  assert.throws(() => qaCirclesSchemaCli([]), /Usage/);
  assert.throws(() => qaCirclesSchemaCli(["--project-ref", QA_CIRCLES_PROJECT_REF, "--execute"]), /Usage/);
  assert.equal(qaCirclesSchemaCli(["--project-ref", QA_CIRCLES_PROJECT_REF]), bundle);
});

test("preflight protects every target object and checks auth, roles and schema access", () => {
  const preflight = bundle.slice(bundle.indexOf("DO $qa_preflight$"), bundle.indexOf("-- Recipe:"));
  for (const table of QA_CIRCLES_TABLES) assert.ok(preflight.includes(`'${table}'`));
  for (const signature of QA_CIRCLES_FUNCTIONS) assert.ok(preflight.includes(`'${signature.split("(")[0]}'`));
  assert.ok(preflight.includes("'campaign_donors_id_seq'"));
  assert.match(preflight, /to_regclass\('auth\.users'\) IS NULL/);
  assert.match(preflight, /ARRAY\['anon','authenticated','service_role'\]/);
  assert.match(preflight, /has_schema_privilege\(role_name, 'public', 'USAGE'\)/);
  assert.match(preflight, /already exists; inspect instead of/);
  assert.doesNotMatch(preflight, /select \*|auth\.users\s+(?:where|limit)|public\.wallets/i);
});

test("postinstall aborts mismatched effective privileges, column grants, sequence and functions", () => {
  const verify = bundle.slice(bundle.indexOf("DO $qa_verify$"));
  for (const operation of ["has_table_privilege", "has_any_column_privilege", "has_sequence_privilege", "has_function_privilege",
    "WITH GRANT OPTION", "aclexplode", "attacl", "relrowsecurity", "attidentity = 'a'", "NOT prosecdef", 'search_path=""'])
    assert.ok(verify.includes(operation), operation);
  assert.ok(verify.includes("ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']"));
  assert.match(verify, /server_version_num.*170000/);
  assert.match(verify, /table_privileges := table_privileges \|\| ARRAY\['MAINTAIN'\]/);
  for (const signature of QA_CIRCLES_FUNCTIONS) assert.ok(verify.includes(`'${signature}'`));
  assert.match(verify, /unexpected function overload/);
  assert.match(verify, /signature <> 'guard_circles_testnet_campaign_mapping\(\)'/);
});

test("verifies restrictive false policies, zero rows, immutable trigger and all ten indexes", () => {
  const verify = bundle.slice(bundle.indexOf("DO $qa_verify$"));
  assert.match(verify, /count\(\*\).*pg_catalog\.pg_policy.*<> 1/);
  assert.match(verify, /NOT polpermissive AND polcmd = '\*'/);
  assert.match(verify, /cardinality\(polroles\) = 2 AND polroles @> client_oids/);
  assert.match(verify, /pg_get_expr\(polqual, polrelid\) = 'false'/);
  assert.match(verify, /pg_get_expr\(polwithcheck, polrelid\) = 'false'/);
  assert.match(verify, /SELECT count\(\*\) FROM public\.%I/);
  assert.match(verify, /target_count <> 0 THEN RAISE EXCEPTION/);
  assert.match(verify, /tgenabled = 'O' AND tgtype = 27 AND tgnargs = 0/);
  assert.match(verify, /tgfoid = 'public\.guard_circles_testnet_campaign_mapping\(\)'::regprocedure/);
  const indexNames = [...verify.matchAll(/\('(\w+_idx)',/g)].map(match => match[1]);
  assert.equal(indexNames.length, 10);
  assert.equal(new Set(indexNames).size, 10);
  for (const name of ["campaign_update_subscriptions_user_idx", "campaign_updates_publisher_idx",
    "campaign_update_outbox_subscription_idx", "campaign_update_outbox_user_idx"]) assert.ok(indexNames.includes(name));
  assert.match(verify, /i\.indisvalid AND i\.indisready/);
  assert.match(verify, /am\.amname = 'btree'/);
  assert.match(verify, /i\.indexprs IS NULL/);
  assert.match(verify, /pg_get_indexdef/);
  assert.match(verify, /i\.indoption\[key_number - 1\]/);
  assert.match(verify, /pg_get_expr\(i\.indpred, i\.indrelid\) IS NOT DISTINCT FROM index_spec\.predicate/);
});

test("catalog checks separate column definitions from zero-based btree sort flags", () => {
  const verify = bundle.slice(bundle.indexOf("DO $qa_verify$"));
  assert.match(verify, /\('campaign_donors_feed_idx', 'campaign_donors', ARRAY\['network', 'contract_id', 'campaign_id', 'id'\]::text\[\], ARRAY\[0, 0, 0, 3\]::smallint\[\]/);
  assert.match(verify, /\('campaign_updates_scope_idx', 'campaign_updates', ARRAY\['network', 'contract_id', 'campaign_id', 'published_at'\]::text\[\], ARRAY\[0, 0, 0, 3\]::smallint\[\]/);
  assert.doesNotMatch(verify, /'id DESC'|'published_at DESC'/);
  const specifications = [...verify.matchAll(/\('\w+_idx', '\w+', ARRAY\[([^\]]+)\]::text\[\], ARRAY\[([^\]]+)\]::smallint\[\]/g)];
  assert.equal(specifications.length, 10);
  for (const specification of specifications) {
    const columns = specification[1].split(",");
    const options = specification[2].split(",").map(value => Number(value.trim()));
    assert.equal(columns.length, options.length);
    assert.ok(options.every(value => value === 0 || value === 3));
  }
  assert.equal(specifications.filter(specification => specification[2].includes("3")).length, 2);
  assert.match(verify, /ARRAY\(SELECT i\.indoption\[key_number - 1\] FROM generate_series\(1, i\.indnkeyatts\) key_number\) = index_spec\.sort_options/);
});

test("CLI only generates deterministic nonsecret SQL and has no execution or wallet access", () => {
  const script = fileURLToPath(new URL("./qa-circles-schema.mts", import.meta.url));
  const result = spawnSync(process.execPath, ["--experimental-strip-types", script, "--project-ref", QA_CIRCLES_PROJECT_REF], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, bundle);
  const noTarget = spawnSync(process.execPath, ["--experimental-strip-types", script], { encoding: "utf8" });
  assert.notEqual(noTarget.status, 0);
  assert.equal(noTarget.stdout, "");
  const source = readFileSync(new URL("./qa-circles-schema.mts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /process\.env|fetch\s*\(|@supabase|SUPABASE_SERVICE|secret_cipher|writeFile|execSync/);
  assert.doesNotMatch(bundle, /(?:select|insert into|alter table|delete from|update|truncate)\s+(?:\*\s+from\s+)?public\.wallets/i);
  assert.match(bundle, /0 AS provisioned_campaign_mappings;\nCOMMIT;/);
  assert.match(bundle, /Nonsecret summary/);
  assert.deepEqual(recipes.map(recipe => recipe.name), [...QA_CIRCLES_RECIPE_FILES]);
});
