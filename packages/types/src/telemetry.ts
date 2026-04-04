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
  readonly repo: string;
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

export interface InsightsDaily {
  readonly date: string;
  readonly aiCost: number;
  readonly aiLines: number;
  readonly manualLines: number;
}

export interface InsightsMetrics {
  // Throughput
  readonly totalAILines: number;
  readonly totalManualLines: number;
  readonly totalTasks: number;
  /** (aiLines + manualLines) / manualLines — null if no manual lines */
  readonly productivityMultiplier: number | null;

  // Capacity freed
  /** Hours of manual coding work handled by AI */
  readonly capacityFreedHours: number;

  // Cost efficiency
  readonly totalAICost: number;
  /** totalAICost / totalAILines — null if no AI lines */
  readonly costPerAILine: number | null;
  /** totalAICost / totalTasks — null if no tasks */
  readonly costPerTask: number | null;

  // Tandemu impact
  /** Times memories were accessed in the period */
  readonly memoryHits: number;
  /** % change in friction events vs previous period (negative = improvement) */
  readonly frictionEventsReduced: number | null;
  /** Number of org-scoped memories shared across team */
  readonly orgMemoriesShared: number;

  // Charting
  readonly daily: readonly InsightsDaily[];

  // Transparency
  readonly assumptions: {
    readonly developerHourlyRate: number;
    readonly aiLineTimeEstimateSeconds: number;
    readonly currency: string;
  };
}

export interface DORADeploymentFrequency {
  readonly avgPerWeek: number;
  readonly trend: ReadonlyArray<{ readonly week: string; readonly deployments: number }>;
  readonly rating: 'elite' | 'high' | 'medium' | 'low';
}

export interface DORALeadTime {
  readonly medianHours: number;
  readonly p95Hours: number;
  readonly trend: ReadonlyArray<{ readonly week: string; readonly medianHours: number }>;
  readonly rating: 'elite' | 'high' | 'medium' | 'low';
}

export interface DORAMetrics {
  readonly deploymentFrequency: DORADeploymentFrequency | null;
  readonly leadTimeForChanges: DORALeadTime | null;
  readonly changeFailureRate: null;
  readonly meanTimeToRestore: null;
}
