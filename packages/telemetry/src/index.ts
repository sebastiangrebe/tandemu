import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

export function initTelemetry(serviceName: string) {
  const sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: serviceName,
    }),
    traceExporter: new OTLPTraceExporter({
      url: process.env["OTEL_EXPORTER_OTLP_ENDPOINT"] ?? "http://localhost:4317",
    }),
  });

  sdk.start();

  process.on("SIGTERM", () => {
    sdk.shutdown().catch(console.error);
  });

  return sdk;
}

export {
  createClickHouseClient,
  getClickHouseClient,
  queryAIvsManualRatio,
  queryFrictionHeatmap,
  querySessionTimesheets,
} from "./clickhouse/client.js";

export type { ClickHouseConfig } from "./clickhouse/client.js";
