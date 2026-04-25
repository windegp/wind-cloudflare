/**
 * WIND Observability v2 - Unified Event Pipeline
 * 
 * This module provides a centralized event pipeline for:
 * - Request tracing with unique trace IDs
 * - Event aggregation and buffering
 * - Cost tracking
 * - Anomaly detection
 * - Real-time event streaming
 */

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export type EventType = 
  | 'firestore_read'
  | 'firestore_write'
  | 'kv_get'
  | 'kv_set'
  | 'kv_delete'
  | 'swr_fetch'
  | 'swr_cache_hit'
  | 'swr_cache_miss'
  | 'revalidation'
  | 'api_request'
  | 'api_response'
  | 'error'
  | 'performance';

export interface TraceEvent {
  id: string;
  traceId: string;
  timestamp: string;
  type: EventType;
  source: string;
  duration?: number;
  metadata: Record<string, any>;
  cost?: number;
  userId?: string;
  sessionId?: string;
}

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  userId?: string;
  sessionId?: string;
  metadata: Record<string, any>;
}

// ═══════════════════════════════════════════════════════════
// TRACE ID GENERATION
// ═══════════════════════════════════════════════════════════

function generateTraceId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

function generateSpanId(): string {
  return Math.random().toString(36).substring(2, 15);
}

// ═══════════════════════════════════════════════════════════
// TRACE CONTEXT MANAGEMENT
// ═══════════════════════════════════════════════════════════

class TraceManager {
  private context: Map<string, TraceContext> = new Map();
  private currentTraceId: string | null = null;

  createTrace(userId?: string, sessionId?: string): TraceContext {
    const traceId = generateTraceId();
    const spanId = generateSpanId();
    
    const context: TraceContext = {
      traceId,
      spanId,
      userId,
      sessionId,
      metadata: {}
    };

    this.context.set(traceId, context);
    this.currentTraceId = traceId;
    
    return context;
  }

  createSpan(parentSpanId?: string): TraceContext | null {
    if (!this.currentTraceId) return null;
    
    const parentContext = this.context.get(this.currentTraceId);
    if (!parentContext) return null;

    const spanId = generateSpanId();
    const spanContext: TraceContext = {
      ...parentContext,
      spanId,
      parentSpanId: parentSpanId || parentContext.spanId
    };

    this.context.set(`${this.currentTraceId}-${spanId}`, spanContext);
    
    return spanContext;
  }

  getCurrentTrace(): TraceContext | null {
    if (!this.currentTraceId) return null;
    return this.context.get(this.currentTraceId) || null;
  }

  endTrace(): void {
    if (this.currentTraceId) {
      this.context.delete(this.currentTraceId);
      this.currentTraceId = null;
    }
  }

  getTraceId(): string | null {
    return this.currentTraceId;
  }
}

export const traceManager = new TraceManager();

// ═══════════════════════════════════════════════════════════
// EVENT BUFFER
// ═══════════════════════════════════════════════════════════

class EventBuffer {
  private buffer: TraceEvent[] = [];
  private maxSize = 1000;
  private flushInterval = 5000; // 5 seconds
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.startFlushInterval();
    }
  }

  add(event: TraceEvent): void {
    this.buffer.push(event);
    
    if (this.buffer.length >= this.maxSize) {
      this.flush();
    }
  }

  private startFlushInterval(): void {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  private flush(): void {
    if (this.buffer.length === 0) return;
    if (typeof window === 'undefined') return;

    // Store in sessionStorage for persistence
    try {
      const existing = JSON.parse(sessionStorage.getItem('wind_event_buffer') || '[]');
      const combined = [...existing, ...this.buffer].slice(-5000); // Keep last 5000
      sessionStorage.setItem('wind_event_buffer', JSON.stringify(combined));
    } catch (e) {
      // Ignore storage errors
    }

    this.buffer = [];
  }

  getEvents(limit = 100): TraceEvent[] {
    if (typeof window === 'undefined') {
      return this.buffer.slice(-limit);
    }
    try {
      const stored = JSON.parse(sessionStorage.getItem('wind_event_buffer') || '[]');
      return [...this.buffer, ...stored].slice(-limit);
    } catch {
      return this.buffer.slice(-limit);
    }
  }

  clear(): void {
    this.buffer = [];
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('wind_event_buffer');
    }
  }

  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
  }
}

export const eventBuffer = new EventBuffer();

// ═══════════════════════════════════════════════════════════
// COST CALCULATOR
// ═══════════════════════════════════════════════════════════

// Firestore pricing (approximate USD)
const FIRESTORE_PRICING = {
  read: 0.06 / 100000, // $0.06 per 100,000 reads
  write: 0.18 / 100000, // $0.18 per 100,000 writes
  delete: 0.02 / 100000 // $0.02 per 100,000 deletes
};

// KV pricing (Cloudflare Workers KV - approximate)
const KV_PRICING = {
  read: 0.50 / 1000000, // $0.50 per million reads
  write: 5.00 / 1000000, // $5.00 per million writes
  delete: 5.00 / 1000000 // $5.00 per million deletes
};

export function calculateFirestoreCost(operation: 'read' | 'write' | 'delete', count: number): number {
  const pricePerOp = FIRESTORE_PRICING[operation];
  return pricePerOp * count;
}

export function calculateKVCost(operation: 'read' | 'write' | 'delete', count: number): number {
  const pricePerOp = KV_PRICING[operation];
  return pricePerOp * count;
}

export function calculateEventCost(event: TraceEvent): number {
  switch (event.type) {
    case 'firestore_read':
      return calculateFirestoreCost('read', event.metadata.docCount || 1);
    case 'firestore_write':
      return calculateFirestoreCost('write', event.metadata.docCount || 1);
    case 'kv_get':
      return calculateKVCost('read', 1);
    case 'kv_set':
      return calculateKVCost('write', 1);
    case 'kv_delete':
      return calculateKVCost('delete', 1);
    default:
      return 0;
  }
}

// ═══════════════════════════════════════════════════════════
// ANOMALY DETECTION
// ═══════════════════════════════════════════════════════════

interface AnomalyThreshold {
  metric: string;
  threshold: number;
  operator: '>' | '<' | '=' | '!=' | '>=' | '<=';
  severity: 'low' | 'medium' | 'high' | 'critical';
}

const DEFAULT_THRESHOLDS: AnomalyThreshold[] = [
  { metric: 'firestoreReadsPerMinute', threshold: 100, operator: '>', severity: 'high' },
  { metric: 'firestoreReadsPerMinute', threshold: 200, operator: '>', severity: 'critical' },
  { metric: 'cacheHitRate', threshold: 50, operator: '<', severity: 'medium' },
  { metric: 'cacheHitRate', threshold: 30, operator: '<', severity: 'high' },
  { metric: 'averageResponseTime', threshold: 1000, operator: '>', severity: 'medium' },
  { metric: 'averageResponseTime', threshold: 3000, operator: '>', severity: 'high' },
  { metric: 'errorRate', threshold: 5, operator: '>', severity: 'medium' },
  { metric: 'errorRate', threshold: 10, operator: '>', severity: 'critical' }
];

interface Anomaly {
  id: string;
  timestamp: string;
  metric: string;
  value: number;
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
}

class AnomalyDetector {
  private history: Map<string, number[]> = new Map();
  private anomalies: Anomaly[] = [];
  private maxHistorySize = 100;

  recordMetric(metric: string, value: number): void {
    if (!this.history.has(metric)) {
      this.history.set(metric, []);
    }
    
    const values = this.history.get(metric)!;
    values.push(value);
    
    if (values.length > this.maxHistorySize) {
      values.shift();
    }
  }

  checkThresholds(metrics: Record<string, number>): Anomaly[] {
    const detectedAnomalies: Anomaly[] = [];

    for (const threshold of DEFAULT_THRESHOLDS) {
      const value = metrics[threshold.metric];
      if (value === undefined) continue;

      let isAnomaly = false;
      switch (threshold.operator) {
        case '>': isAnomaly = value > threshold.threshold; break;
        case '<': isAnomaly = value < threshold.threshold; break;
        case '>=': isAnomaly = value >= threshold.threshold; break;
        case '<=': isAnomaly = value <= threshold.threshold; break;
        case '=': isAnomaly = value === threshold.threshold; break;
        case '!=': isAnomaly = value !== threshold.threshold; break;
      }

      if (isAnomaly) {
        const anomaly: Anomaly = {
          id: generateTraceId(),
          timestamp: new Date().toISOString(),
          metric: threshold.metric,
          value,
          threshold: threshold.threshold,
          severity: threshold.severity,
          message: `${threshold.metric} is ${value} (threshold: ${threshold.threshold})`
        };
        
        detectedAnomalies.push(anomaly);
        this.anomalies.push(anomaly);
      }
    }

    return detectedAnomalies;
  }

  getRecentAnomalies(limit = 50): Anomaly[] {
    return this.anomalies.slice(-limit);
  }

  clearAnomalies(): void {
    this.anomalies = [];
  }
}

export const anomalyDetector = new AnomalyDetector();

// ═══════════════════════════════════════════════════════════
// EVENT EMITTER
// ═══════════════════════════════════════════════════════════

type EventListener = (event: TraceEvent) => void;

class EventEmitter {
  private listeners: Map<EventType, EventListener[]> = new Map();
  private allListeners: EventListener[] = [];

  on(eventType: EventType, listener: EventListener): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType)!.push(listener);
  }

  onAll(listener: EventListener): void {
    this.allListeners.push(listener);
  }

  off(eventType: EventType, listener: EventListener): void {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  emit(event: TraceEvent): void {
    // Emit to type-specific listeners
    const typeListeners = this.listeners.get(event.type);
    if (typeListeners) {
      typeListeners.forEach(listener => listener(event));
    }

    // Emit to all listeners
    this.allListeners.forEach(listener => listener(event));
  }
}

export const eventEmitter = new EventEmitter();

// ═══════════════════════════════════════════════════════════
// MAIN EVENT PIPELINE
// ═══════════════════════════════════════════════════════════

export function emitEvent(
  type: EventType,
  source: string,
  metadata: Record<string, any> = {},
  duration?: number
): string {
  const traceContext = traceManager.getCurrentTrace();
  const traceId = traceContext?.traceId || generateTraceId();
  
  const event: TraceEvent = {
    id: generateTraceId(),
    traceId,
    timestamp: new Date().toISOString(),
    type,
    source,
    duration,
    metadata,
    cost: calculateEventCost({ type, source, metadata } as TraceEvent),
    userId: traceContext?.userId,
    sessionId: traceContext?.sessionId
  };

  // Add to buffer
  eventBuffer.add(event);

  // Emit to listeners
  eventEmitter.emit(event);

  // Record metrics for anomaly detection
  if (type === 'firestore_read') {
    anomalyDetector.recordMetric('firestoreReadsPerMinute', 1);
  }
  if (type === 'error') {
    anomalyDetector.recordMetric('errorRate', 1);
  }
  if (duration) {
    anomalyDetector.recordMetric('averageResponseTime', duration);
  }

  return event.id;
}

// ═══════════════════════════════════════════════════════════
// REQUEST TRACING WRAPPER
// ═══════════════════════════════════════════════════════════

export async function traceRequest<T>(
  operation: string,
  fn: () => Promise<T>,
  metadata: Record<string, any> = {}
): Promise<T> {
  const startTime = performance.now();
  const eventId = emitEvent('api_request', operation, metadata);

  try {
    const result = await fn();
    const duration = performance.now() - startTime;
    
    emitEvent('api_response', operation, {
      ...metadata,
      success: true,
      requestId: eventId
    }, duration);

    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    
    emitEvent('error', operation, {
      ...metadata,
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId: eventId
    }, duration);

    throw error;
  }
}

// ═══════════════════════════════════════════════════════════
// PERFORMANCE REGRESSION TRACKING
// ═══════════════════════════════════════════════════════════

interface PerformanceBaseline {
  operation: string;
  p50: number;
  p95: number;
  p99: number;
  sampleSize: number;
  lastUpdated: string;
}

class PerformanceTracker {
  private baselines: Map<string, PerformanceBaseline> = new Map();
  private measurements: Map<string, number[]> = new Map();

  recordMeasurement(operation: string, duration: number): void {
    if (!this.measurements.has(operation)) {
      this.measurements.set(operation, []);
    }
    
    const measurements = this.measurements.get(operation)!;
    measurements.push(duration);
    
    // Keep last 1000 measurements
    if (measurements.length > 1000) {
      measurements.shift();
    }

    // Update baseline every 100 measurements
    if (measurements.length % 100 === 0) {
      this.updateBaseline(operation);
    }
  }

  private updateBaseline(operation: string): void {
    const measurements = this.measurements.get(operation);
    if (!measurements || measurements.length < 10) return;

    const sorted = [...measurements].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];

    this.baselines.set(operation, {
      operation,
      p50,
      p95,
      p99,
      sampleSize: measurements.length,
      lastUpdated: new Date().toISOString()
    });
  }

  getBaseline(operation: string): PerformanceBaseline | null {
    return this.baselines.get(operation) || null;
  }

  checkRegression(operation: string, duration: number): boolean {
    const baseline = this.getBaseline(operation);
    if (!baseline) return false;

    // Regression if current duration is 2x worse than p95
    return duration > baseline.p95 * 2;
  }

  getAllBaselines(): PerformanceBaseline[] {
    return Array.from(this.baselines.values());
  }
}

export const performanceTracker = new PerformanceTracker();

// ═══════════════════════════════════════════════════════════
// AGGREGATED METRICS (Using new server buffer)
// ═══════════════════════════════════════════════════════════

import { getPipelineMetrics as getBufferMetrics, getEvents } from './observabilityBuffer';

export function getPipelineMetrics() {
  // Use new server-side buffer for metrics
  const bufferMetrics = getBufferMetrics();
  
  // Get events from buffer for detailed analysis
  const events = getEvents({ limit: 1000 });
  
  // Calculate type-based metrics
  const byType: Record<string, number> = {};
  events.forEach(e => {
    byType[e.type] = (byType[e.type] || 0) + 1;
  });

  // Legacy-compatible metrics structure
  const legacyMetrics = {
    totalEvents: events.length,
    firestoreReads: byType.firestore || 0,
    firestoreWrites: byType['firestore-write'] || 0,
    kvReads: byType.kv || 0,
    kvWrites: byType['kv-write'] || 0,
    errors: byType.error || 0,
    totalCost: bufferMetrics.costMetrics?.totalReads || 0,
    averageDuration: bufferMetrics.traceSummary?.averageTraceDuration || 0,
    anomalies: anomalyDetector.getRecentAnomalies(10),
    baselines: performanceTracker.getAllBaselines(),
    // New buffer metrics
    ...bufferMetrics
  };
  
  return legacyMetrics;
}
