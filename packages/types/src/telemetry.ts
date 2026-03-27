export type SpanStatus = "OK" | "ERROR" | "UNSET";

export type MetricType = "counter" | "gauge" | "histogram";

export interface TelemetrySpan {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly operationName: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly attributes: Record<string, string | number | boolean>;
  readonly status: SpanStatus;
}

export interface TelemetryMetric {
  readonly name: string;
  readonly value: number;
  readonly unit: string;
  readonly timestamp: string;
  readonly attributes: Record<string, string | number | boolean>;
  readonly metricType: MetricType;
}

export interface TelemetryLog {
  readonly timestamp: string;
  readonly severityText: string;
  readonly body: string;
  readonly attributes: Record<string, string | number | boolean>;
  readonly traceId?: string;
  readonly spanId?: string;
}

export interface AIvsManualRatio {
  readonly organizationId: string;
  readonly sprintId: string;
  readonly aiGeneratedLines: number;
  readonly manualLines: number;
  readonly ratio: number;
  readonly periodStart: string;
  readonly periodEnd: string;
}

export interface FrictionEvent {
  readonly sessionId: string;
  readonly userId: string;
  readonly repositoryPath: string;
  readonly promptLoopCount: number;
  readonly errorCount: number;
  readonly timestamp: string;
}

export interface DeveloperStat {
  readonly userId: string;
  readonly userName: string;
  readonly sessions: number;
  readonly activeMinutes: number;
  readonly aiLines: number;
  readonly manualLines: number;
}

export interface TaskVelocityEntry {
  readonly week: string;
  readonly avgDurationHours: number;
  readonly taskCount: number;
}

export interface HotFile {
  readonly filePath: string;
  readonly changeCount: number;
  readonly taskCount: number;
  readonly developerCount: number;
}

export interface InvestmentAllocation {
  readonly category: string;
  readonly taskCount: number;
  readonly totalHours: number;
}

export interface AIEffectivenessEntry {
  readonly filePath: string;
  readonly aiTouchCount: number;
}

export interface CostEntry {
  readonly date: string;
  readonly totalCost: number;
}

export interface TokenUsageEntry {
  readonly tokenType: string;
  readonly model: string;
  readonly totalTokens: number;
}
