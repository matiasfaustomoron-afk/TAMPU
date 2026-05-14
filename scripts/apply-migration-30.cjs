// Apply migration 00030 + 00029 directly via pg to Supabase prod.
// Standalone script — borrar después de usar.
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const conn = process.env.PG_URL;
if (!conn) {
  console.error("Set PG_URL env var");
  process.exit(1);
}

async function main() {
  const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  console.log("Connecting to Supabase Postgres...");
  await client.connect();
  console.log("✓ Connected");

  const migrationsDir = path.join(__dirname, "..", "supabase", "migrations");
  const migrations = ["00029_audit_fixes_batch.sql", "00030_create_trip_rpc.sql"];

  for (const file of migrations) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    console.log(`\n→ Applying ${file} (${sql.length} chars)...`);
    try {
      await client.query(sql);
      console.log(`✓ ${file} applied OK`);
    } catch (e) {
      console.error(`✗ ${file} FAILED:`, e.message);
      if (e.position) console.error(`  Position: ${e.position}, Code: ${e.code}`);
      // Continue with next migration even if this fails (some constraints may already exist)
    }
  }

  console.log("\n=== Verification ===");
  const r1 = await client.query("select count(*) from pg_proc where proname = 'create_trip'");
  console.log("create_trip function exists:", r1.rows[0].count);

  const r2 = await client.query("select count(*) from pg_policies where tablename = 'trip_members' and policyname like '%pending%'");
  console.log("trip_members pending policies:", r2.rows[0].count);

  const r3 = await client.query("select count(*) from pg_indexes where tablename = 'budget_categories' and indexname = 'uq_budget_categories_trip_cat'");
  console.log("budget_categories unique index:", r3.rows[0].count);

  await client.end();
  console.log("\n✓ DONE — disconnecting");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
