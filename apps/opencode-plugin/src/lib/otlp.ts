import type { TandemuConfig } from "./config.ts";

const SERVICE_NAME = "opencode";

type Counter = {
  metric: string;
  value: number;
  attrs: Record<string, string | number>;
  ts: number;
};

let buffer: Counter[] = [];
let flushing: Promise<void> | null = null;

export function record(
  metric: string,
  value: number,
  attrs: Record<string, string | number> = {},
): void {
  if (!Number.isFinite(value) || value === 0) return;
  buffer.push({ metric, value, attrs, ts: Date.now() });
}

export async function flush(
  config: TandemuConfig,
  endpoint: string,
): Promise<void> {
  if (flushing) return flushing;
  if (buffer.length === 0) return;

  const batch = buffer;
  buffer = [];

  flushing = (async () => {
    try {
      const payload = buildOtlpPayload(batch, config);
      const url = endpoint.replace(/\/$/, "") + "/v1/metrics";
      await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.auth.token}`,
        },
        body: JSON.stringify(payload),
      });
    } catch {
      buffer.unshift(...batch);
    } finally {
      flushing = null;
    }
  })();

  return flushing;
}

function buildOtlpPayload(batch: Counter[], config: TandemuConfig) {
  const byMetric = new Map<string, Counter[]>();
  for (const c of batch) {
    const list = byMetric.get(c.metric) ?? [];
    list.push(c);
    byMetric.set(c.metric, list);
  }

  return {
    resourceMetrics: [
      {
        resource: {
          attributes: [
            kv("service.name", SERVICE_NAME),
            kv("organization_id", config.organization.id),
            kv("user_id", config.user.id),
            kv("user_email", config.user.email),
          ],
        },
        scopeMetrics: [
          {
            scope: { name: "@tandemu/opencode-plugin", version: "1.9.8" },
            metrics: [...byMetric.entries()].map(([metric, points]) => ({
              name: metric,
              sum: {
                aggregationTemporality: 2, // DELTA
                isMonotonic: true,
                dataPoints: points.map((p) => ({
                  asDouble: p.value,
                  timeUnixNano: String(p.ts * 1_000_000),
                  startTimeUnixNano: String(p.ts * 1_000_000),
                  attributes: Object.entries(p.attrs).map(([k, v]) =>
                    typeof v === "number" ? kv(k, v) : kv(k, String(v)),
                  ),
                })),
              },
            })),
          },
        ],
      },
    ],
  };
}

function kv(key: string, value: string | number) {
  return typeof value === "number"
    ? { key, value: { doubleValue: value } }
    : { key, value: { stringValue: value } };
}
