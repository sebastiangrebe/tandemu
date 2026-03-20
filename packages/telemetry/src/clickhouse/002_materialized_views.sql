-- These materialized views reference tables created by the OTel Collector's
-- ClickHouse exporter. They must be run AFTER the collector has started and
-- created its tables. Run manually or via the setup script:
--   docker exec tandem-clickhouse-1 clickhouse-client --database otel --multiquery < packages/telemetry/src/clickhouse/002_materialized_views.sql

-- Materialized view: ai_vs_manual_daily
-- Aggregates AI-generated vs manual code lines per tenant per day
-- Source: otel_metrics_sum (created by OTel Collector)
CREATE MATERIALIZED VIEW IF NOT EXISTS ai_vs_manual_daily
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(day)
ORDER BY (service_name, day)
AS
SELECT
    ServiceName AS service_name,
    toDate(TimeUnix) AS day,
    sumStateIf(Value, MetricName = 'code.lines.ai_generated') AS ai_generated_lines,
    sumStateIf(Value, MetricName = 'code.lines.manual') AS manual_lines
FROM otel_metrics_sum
WHERE MetricName IN ('code.lines.ai_generated', 'code.lines.manual')
GROUP BY ServiceName, toDate(TimeUnix);

-- Materialized view: friction_events_hourly
-- Aggregates friction events (prompt loops, API errors) per service per hour per repo
-- Source: otel_logs (created by OTel Collector)
CREATE MATERIALIZED VIEW IF NOT EXISTS friction_events_hourly
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (service_name, hour, repository_path)
AS
SELECT
    ServiceName AS service_name,
    toStartOfHour(TimestampTime) AS hour,
    LogAttributes['repository.path'] AS repository_path,
    countState() AS event_count,
    uniqState(LogAttributes['session.id']) AS unique_sessions
FROM otel_logs
WHERE Body LIKE '%prompt_loop%' OR LogAttributes['event.type'] = 'api_error'
GROUP BY ServiceName, toStartOfHour(TimestampTime), LogAttributes['repository.path'];

-- Materialized view: session_duration_daily
-- Aggregates session durations per service per day per user
-- Source: otel_traces (created by OTel Collector)
CREATE MATERIALIZED VIEW IF NOT EXISTS session_duration_daily
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(day)
ORDER BY (service_name, day, user_id)
AS
SELECT
    ServiceName AS service_name,
    toDate(Timestamp) AS day,
    SpanAttributes['user.id'] AS user_id,
    sumState(Duration) AS total_duration_ns,
    countState() AS session_count
FROM otel_traces
WHERE SpanName = 'session'
GROUP BY ServiceName, toDate(Timestamp), SpanAttributes['user.id'];
