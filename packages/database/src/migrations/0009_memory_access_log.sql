-- Track memory access frequency for usage insights
-- This table is in ClickHouse (not Postgres) — run against the ClickHouse instance
CREATE TABLE IF NOT EXISTS memory_access_log (
  memory_id String,
  organization_id String,
  user_id String,
  access_type Enum8('search' = 1, 'list' = 2, 'mcp_proxy' = 3),
  timestamp DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (organization_id, memory_id, timestamp)
TTL timestamp + INTERVAL 90 DAY;
