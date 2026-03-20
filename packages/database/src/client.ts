import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import * as schema from "./schema/index.js";

const { Pool } = pg;

export type Database = NodePgDatabase<typeof schema>;

export function createDb(connectionString: string): Database {
  const pool = new Pool({ connectionString });
  return drizzle(pool, { schema });
}

/**
 * Sets the current tenant for RLS policies within the current transaction.
 * Must be called inside a transaction for SET LOCAL to take effect.
 */
export async function setTenant(db: Database, tenantId: string): Promise<void> {
  await db.execute(
    sql`SELECT set_config('app.current_tenant', ${tenantId}, true)`
  );
}
