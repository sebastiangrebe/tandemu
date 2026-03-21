/**
 * Helpers to send OTLP telemetry data directly to the collector
 * for E2E testing of dashboard pages.
 *
 * Uses the OTLP/HTTP JSON protocol at localhost:4318.
 */

const OTEL_HTTP = 'http://localhost:4318';

function hexTraceId(): string {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

function hexSpanId(): string {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

/** nanosecond timestamp from a Date */
function toNano(d: Date): string {
  return (BigInt(d.getTime()) * 1_000_000n).toString();
}

/**
 * Send trace spans (sessions) to the OTEL collector.
 * Each span represents a coding session.
 */
export async function sendSessionSpans(opts: {
  organizationId: string;
  userId: string;
  sessions: Array<{
    startTime: Date;
    endTime: Date;
    aiAssisted: boolean;
    deployment?: boolean;
    failure?: boolean;
    leadTime?: boolean;
    restore?: boolean;
  }>;
}): Promise<void> {
  const spans = opts.sessions.map((s) => {
    const attributes: Array<{ key: string; value: { stringValue: string } }> = [
      { key: 'user_id', value: { stringValue: opts.userId } },
      { key: 'ai_assisted', value: { stringValue: s.aiAssisted ? 'true' : 'false' } },
    ];
    if (s.deployment) {
      attributes.push({ key: 'deployment', value: { stringValue: 'true' } });
    }
    if (s.failure) {
      attributes.push({ key: 'failure', value: { stringValue: 'true' } });
    }
    if (s.leadTime) {
      attributes.push({ key: 'type', value: { stringValue: 'lead_time' } });
    }
    if (s.restore) {
      attributes.push({ key: 'type', value: { stringValue: 'restore' } });
    }

    return {
      traceId: hexTraceId(),
      spanId: hexSpanId(),
      name: 'coding_session',
      kind: 1, // SPAN_KIND_INTERNAL
      startTimeUnixNano: toNano(s.startTime),
      endTimeUnixNano: toNano(s.endTime),
      attributes,
      status: {},
    };
  });

  const body = {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'claude-code' } },
            { key: 'organization_id', value: { stringValue: opts.organizationId } },
          ],
        },
        scopeSpans: [
          {
            scope: { name: 'tandemu-e2e-test' },
            spans,
          },
        ],
      },
    ],
  };

  const res = await fetch(`${OTEL_HTTP}/v1/traces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Failed to send traces: ${res.status} ${await res.text()}`);
  }
}

/**
 * Send metric data (AI generated lines / manual lines) to the OTEL collector.
 */
export async function sendCodeMetrics(opts: {
  organizationId: string;
  aiGeneratedLines: number;
  manualLines: number;
  sprintId?: string;
}): Promise<void> {
  const now = toNano(new Date());
  const startNano = toNano(new Date(Date.now() - 3600_000)); // 1h ago

  const body = {
    resourceMetrics: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'claude-code' } },
            { key: 'organization_id', value: { stringValue: opts.organizationId } },
            { key: 'sprint_id', value: { stringValue: opts.sprintId ?? 'current' } },
          ],
        },
        scopeMetrics: [
          {
            scope: { name: 'tandemu-e2e-test' },
            metrics: [
              {
                name: 'code.lines.ai_generated',
                sum: {
                  dataPoints: [
                    {
                      startTimeUnixNano: startNano,
                      timeUnixNano: now,
                      asDouble: opts.aiGeneratedLines,
                      attributes: [],
                    },
                  ],
                  aggregationTemporality: 2, // CUMULATIVE
                  isMonotonic: true,
                },
              },
              {
                name: 'code.lines.manual',
                sum: {
                  dataPoints: [
                    {
                      startTimeUnixNano: startNano,
                      timeUnixNano: now,
                      asDouble: opts.manualLines,
                      attributes: [],
                    },
                  ],
                  aggregationTemporality: 2,
                  isMonotonic: true,
                },
              },
            ],
          },
        ],
      },
    ],
  };

  const res = await fetch(`${OTEL_HTTP}/v1/metrics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Failed to send metrics: ${res.status} ${await res.text()}`);
  }
}

/**
 * Send friction log events (prompt loops, errors) to the OTEL collector.
 */
export async function sendFrictionLogs(opts: {
  organizationId: string;
  events: Array<{
    userId: string;
    sessionId: string;
    repositoryPath: string;
    severityText: 'prompt_loop' | 'error';
    promptLoopCount?: number;
    errorCount?: number;
  }>;
}): Promise<void> {
  const now = toNano(new Date());

  const logRecords = opts.events.map((e) => ({
    timeUnixNano: now,
    severityText: e.severityText,
    severityNumber: e.severityText === 'error' ? 17 : 13, // ERROR or WARN
    body: { stringValue: `${e.severityText} in ${e.repositoryPath}` },
    attributes: [
      { key: 'session_id', value: { stringValue: e.sessionId } },
      { key: 'user_id', value: { stringValue: e.userId } },
      { key: 'repository_path', value: { stringValue: e.repositoryPath } },
      { key: 'prompt_loop_count', value: { stringValue: String(e.promptLoopCount ?? 0) } },
      { key: 'error_count', value: { stringValue: String(e.errorCount ?? 0) } },
    ],
  }));

  const body = {
    resourceLogs: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'claude-code' } },
            { key: 'organization_id', value: { stringValue: opts.organizationId } },
          ],
        },
        scopeLogs: [
          {
            scope: { name: 'tandemu-e2e-test' },
            logRecords,
          },
        ],
      },
    ],
  };

  const res = await fetch(`${OTEL_HTTP}/v1/logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Failed to send logs: ${res.status} ${await res.text()}`);
  }
}
