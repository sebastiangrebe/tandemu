import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// At runtime __dirname is dist/, but SQL files live in src/migrations
const MIGRATIONS_DIR = path.join(__dirname, '..', 'src', 'migrations');

export async function runMigrations(connectionString: string): Promise<void> {
  const pool = new Pool({ connectionString });

  try {
    // Create migrations tracking table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Get already-applied migrations
    const { rows: applied } = await pool.query<{ name: string }>(
      'SELECT name FROM _migrations ORDER BY name',
    );
    const appliedSet = new Set(applied.map((r) => r.name));

    // Read and sort migration files
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (appliedSet.has(file)) continue;

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      await pool.query('BEGIN');
      try {
        await pool.query(sql);
        await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        await pool.query('COMMIT');
        console.log(`Migration applied: ${file}`);
      } catch (err) {
        await pool.query('ROLLBACK');
        throw new Error(`Migration failed: ${file}: ${err instanceof Error ? err.message : err}`);
      }
    }
  } finally {
    await pool.end();
  }
}
