import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

// A reviewed baseline covers historical migrations applied outside CLI history.
// Only new, ordered migrations are executed. Baseline files cannot be rewritten.
const baseline = JSON.parse(fs.readFileSync(process.env.DEPLOY_MIGRATIONS_BASELINE_FILE, 'utf8'));
const directory = path.resolve('supabase/migrations');
const files = fs.readdirSync(directory).filter(name => /^\d{14}_.+\.sql$/.test(name)).sort();
for (const [file, expected] of Object.entries(baseline.files)) {
  const actual = createHash('sha256').update(fs.readFileSync(path.join(directory, file))).digest('hex');
  if (actual !== expected) throw new Error(`Historical migration changed: ${file}. Add a new migration instead.`);
}
const connection = new URL(process.env.DEPLOY_DATABASE_URL);
if (connection.search) throw new Error('Set TLS via DEPLOY_DATABASE_CA, not URL parameters.');
const db = new pg.Client({ connectionString: connection.toString(), connectionTimeoutMillis: 15000,
  ssl: { rejectUnauthorized: true, ca: fs.readFileSync(process.env.DEPLOY_DATABASE_CA, 'utf8') } });
try {
  await db.connect();
  await db.query("select pg_advisory_lock(732890419)");
  const applied = new Set((await db.query('select version from supabase_migrations.schema_migrations')).rows.map(row => row.version));
  if (!applied.has(baseline.version)) throw new Error('Migration baseline is not present in this database.');
  for (const file of files) {
    const version = file.slice(0, 14);
    if (version <= baseline.version) {
      if (!baseline.files[file]) throw new Error(`Backdated migration: ${file}`);
      continue;
    }
    if (applied.has(version)) continue;
    const newest = [...applied].sort().at(-1);
    if (version < newest) throw new Error(`Out-of-order migration: ${file}`);
    const sql = fs.readFileSync(path.join(directory, file), 'utf8');
    await db.query('begin');
    try {
      await db.query("set local lock_timeout='10s'");
      await db.query("set local statement_timeout='120s'");
      await db.query(sql);
      await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',
        [version, file.slice(15, -4), [sql]]);
      await db.query('commit');
      console.log(`Applied migration ${file}`);
    } catch (error) {
      await db.query('rollback');
      throw error;
    }
  }
  console.log('Database migrations are current.');
} catch (error) {
  // SQL statements/errors can contain sensitive data; log only diagnostic identifiers.
  console.error('Migration deployment failed:', error.code ?? error.name);
  process.exitCode = 1;
} finally { await db.end(); }
