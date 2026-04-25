/**
 * Observability Data Aggregation Layer
 * 
 * This module aggregates metrics from:
 * - Firestore operations (reads/writes)
 * - KV cache operations (hits/misses)
 * - SWR operations (fetches/dedupes)
 * - Revalidation operations (invalidations)
 * 
 * All data is read-only and does not affect production systems.
 */

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface FirestoreMetrics {
  readsToday: number;
  readsWeek: number;
  readsMonth: number;
  writesToday: number;
  writesWeek: number;
  writesMonth: number;
  topCollections: Array<{ name: string; count: number }>;
  quotaStatus: {
    status: 'healthy' | 'warning' | 'critical' | 'emergency';
    readsThisMinute: number;
    readsPerSecond: string;
    projectedHourly: string;
  };
}

export interface KVCacheMetrics {
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;
  mostAccessedKeys: Array<{ key: string; count: number }>;
  backgroundRefreshes: number;
  stampedePrevented: number;
}

export interface SWRMetrics {
  totalFetches: number;
  dedupedRequests: number;
  inFlightRequests: number;
  cacheHits: number;
  cacheMisses: number;
  averageResponseTime: number;
}

export interface RevalidationMetrics {
  totalInvalidations: number;
  byType: {
    product: number;
    review: number;
    homepage: number;
    collection: number;
    settings: number;
    other: number;
  };
  skippedDueToCooldown: number;
  averageResponseTime: number;
}

export interface ActivityLog {
  id: string;
  timestamp: string;
  type: 'read' | 'write' | 'cache_hit' | 'cache_miss' | 'invalidation' | 'swr_fetch';
  source: string;
  details: string;
  metadata?: Record<string, any>;
}

export interface ObservabilityData {
  firestore: FirestoreMetrics;
  kvCache: KVCacheMetrics;
  swr: SWRMetrics;
  revalidation: RevalidationMetrics;
  activityLogs: ActivityLog[];
  lastUpdated: string;
  // v2 features
  cost?: CostMetrics;
  traces?: TraceSummary;
  anomalies?: AnomalySummary;
  performance?: PerformanceSummary;
}

export interface CostMetrics {
  totalCost: number;
  firestoreCost: number;
  kvCost: number;
  costByOperation: Record<string, number>;
  projectedDailyCost: number;
  projectedMonthlyCost: number;
}

export interface TraceSummary {
  totalTraces: number;
  activeTraces: number;
  averageTraceDuration: number;
  slowestTraces: Array<{ traceId: string; duration: number; operation: string }>;
}

export interface AnomalySummary {
  totalAnomalies: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  recentAnomalies: Array<{ id: string; metric: string; severity: string; timestamp: string }>;
}

export interface PerformanceSummary {
  baselineOperations: number;
  regressionsDetected: number;
  averageLatency: number;
  p95Latency: number;
  p99Latency: number;
}

// ═══════════════════════════════════════════════════════════
// FIRESTORE METRICS
// ═══════════════════════════════════════════════════════════

const READ_LOG_KEY = 'wind_firestore_reads';
const WRITE_LOG_KEY = 'wind_firestore_writes';

function getFirestoreLogs(): any[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(sessionStorage.getItem(READ_LOG_KEY) || '[]');
  } catch {
    return [];
  }
}

function getWriteLogs(): any[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(sessionStorage.getItem(WRITE_LOG_KEY) || '[]');
  } catch {
    return [];
  }
}

export function getFirestoreMetrics(): FirestoreMetrics {
  const logs = getFirestoreLogs();
  const writeLogs = getWriteLogs();
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const oneWeek = 7 * oneDay;
  const oneMonth = 30 * oneDay;

  // Filter reads by time period
  const readsToday = logs.filter(l => now - new Date(l.timestamp).getTime() < oneDay && l.source === 'firestore').length;
  const readsWeek = logs.filter(l => now - new Date(l.timestamp).getTime() < oneWeek && l.source === 'firestore').length;
  const readsMonth = logs.filter(l => now - new Date(l.timestamp).getTime() < oneMonth && l.source === 'firestore').length;

  // Filter writes by time period
  const writesToday = writeLogs.filter(l => now - new Date(l.timestamp).getTime() < oneDay).length;
  const writesWeek = writeLogs.filter(l => now - new Date(l.timestamp).getTime() < oneWeek).length;
  const writesMonth = writeLogs.filter(l => now - new Date(l.timestamp).getTime() < oneMonth).length;

  // Top collections
  const collectionCounts: Record<string, number> = {};
  logs.filter(l => l.source === 'firestore').forEach(l => {
    collectionCounts[l.collection] = (collectionCounts[l.collection] || 0) + (l.docCount || 1);
  });
  const topCollections = Object.entries(collectionCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Quota status (from firestoreQuota.js if available)
  let quotaStatus = {
    status: 'healthy' as const,
    readsThisMinute: 0,
    readsPerSecond: '0',
    projectedHourly: '0'
  };

  // Try to get quota status from the quota system
  if (typeof window !== 'undefined' && (window as any).getQuotaStatus) {
    try {
      quotaStatus = (window as any).getQuotaStatus();
    } catch {}
  }

  return {
    readsToday,
    readsWeek,
    readsMonth,
    writesToday,
    writesWeek,
    writesMonth,
    topCollections,
    quotaStatus
  };
}

// ═══════════════════════════════════════════════════════════
// KV CACHE METRICS
// ═══════════════════════════════════════════════════════════

const KV_LOG_KEY = 'wind_kv_operations';

function getKVLogs(): any[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(sessionStorage.getItem(KV_LOG_KEY) || '[]');
  } catch {
    return [];
  }
}

export function getKVCacheMetrics(): KVCacheMetrics {
  const logs = getKVLogs();
  
  const cacheHits = logs.filter(l => l.operation === 'get' && l.hit).length;
  const cacheMisses = logs.filter(l => l.operation === 'get' && !l.hit).length;
  const hitRate = cacheHits + cacheMisses > 0 ? (cacheHits / (cacheHits + cacheMisses)) * 100 : 0;

  // Most accessed keys
  const keyCounts: Record<string, number> = {};
  logs.filter(l => l.operation === 'get').forEach(l => {
    keyCounts[l.key] = (keyCounts[l.key] || 0) + 1;
  });
  const mostAccessedKeys = Object.entries(keyCounts)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const backgroundRefreshes = logs.filter(l => l.operation === 'background_refresh').length;
  const stampedePrevented = logs.filter(l => l.operation === 'dedupe').length;

  return {
    cacheHits,
    cacheMisses,
    hitRate: Math.round(hitRate * 100) / 100,
    mostAccessedKeys,
    backgroundRefreshes,
    stampedePrevented
  };
}

// ═══════════════════════════════════════════════════════════
// SWR METRICS
// ═══════════════════════════════════════════════════════════

const SWR_LOG_KEY = 'wind_swr_operations';

function getSWRLogs(): any[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(sessionStorage.getItem(SWR_LOG_KEY) || '[]');
  } catch {
    return [];
  }
}

export function getSWRMetrics(): SWRMetrics {
  const logs = getSWRLogs();
  
  const totalFetches = logs.filter(l => l.operation === 'fetch').length;
  const dedupedRequests = logs.filter(l => l.operation === 'dedupe').length;
  const inFlightRequests = logs.filter(l => l.operation === 'in_flight').length;
  const cacheHits = logs.filter(l => l.cacheStatus === 'HIT').length;
  const cacheMisses = logs.filter(l => l.cacheStatus === 'FETCH').length;

  // Average response time
  const fetchesWithTime = logs.filter(l => l.operation === 'fetch' && l.duration);
  const averageResponseTime = fetchesWithTime.length > 0
    ? fetchesWithTime.reduce((sum, l) => sum + (l.duration || 0), 0) / fetchesWithTime.length
    : 0;

  return {
    totalFetches,
    dedupedRequests,
    inFlightRequests,
    cacheHits,
    cacheMisses,
    averageResponseTime: Math.round(averageResponseTime * 100) / 100
  };
}

// ═══════════════════════════════════════════════════════════
// REVALIDATION METRICS
// ═══════════════════════════════════════════════════════════

const REVALIDATION_LOG_KEY = 'wind_revalidation_operations';

function getRevalidationLogs(): any[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(sessionStorage.getItem(REVALIDATION_LOG_KEY) || '[]');
  } catch {
    return [];
  }
}

export function getRevalidationMetrics(): RevalidationMetrics {
  const logs = getRevalidationLogs();
  
  const totalInvalidations = logs.filter(l => l.operation === 'invalidate').length;

  // By type
  const byType = {
    product: logs.filter(l => l.type?.includes('product')).length,
    review: logs.filter(l => l.type?.includes('review')).length,
    homepage: logs.filter(l => l.type?.includes('homepage')).length,
    collection: logs.filter(l => l.type?.includes('collection')).length,
    settings: logs.filter(l => l.type?.includes('settings')).length,
    other: logs.filter(l => l.type && !['product', 'review', 'homepage', 'collection', 'settings'].includes(l.type)).length
  };

  const skippedDueToCooldown = logs.filter(l => l.skipped === true).length;

  // Average response time
  const invalidationsWithTime = logs.filter(l => l.operation === 'invalidate' && l.responseTime);
  const averageResponseTime = invalidationsWithTime.length > 0
    ? invalidationsWithTime.reduce((sum, l) => sum + (l.responseTime || 0), 0) / invalidationsWithTime.length
    : 0;

  return {
    totalInvalidations,
    byType,
    skippedDueToCooldown,
    averageResponseTime: Math.round(averageResponseTime * 100) / 100
  };
}

// ═══════════════════════════════════════════════════════════
// ACTIVITY LOGS
// ═══════════════════════════════════════════════════════════

export function getActivityLogs(limit = 50): ActivityLog[] {
  const allLogs: ActivityLog[] = [];

  // Firestore reads
  getFirestoreLogs().forEach((log, i) => {
    allLogs.push({
      id: `fs_read_${i}`,
      timestamp: log.timestamp,
      type: log.source === 'cache' ? 'cache_hit' : 'read',
      source: 'firestore',
      details: `${log.function} - ${log.collection} (${log.docCount} docs)`,
      metadata: { function: log.function, collection: log.collection, docCount: log.docCount }
    });
  });

  // Firestore writes
  getWriteLogs().forEach((log, i) => {
    allLogs.push({
      id: `fs_write_${i}`,
      timestamp: log.timestamp,
      type: 'write',
      source: 'firestore',
      details: `${log.operation} - ${log.collection}`,
      metadata: { operation: log.operation, collection: log.collection }
    });
  });

  // KV operations
  getKVLogs().forEach((log, i) => {
    allLogs.push({
      id: `kv_${i}`,
      timestamp: log.timestamp,
      type: log.hit ? 'cache_hit' : 'cache_miss',
      source: 'kv',
      details: `${log.operation} - ${log.key}`,
      metadata: { operation: log.operation, key: log.key, hit: log.hit }
    });
  });

  // SWR operations
  getSWRLogs().forEach((log, i) => {
    allLogs.push({
      id: `swr_${i}`,
      timestamp: log.timestamp,
      type: 'swr_fetch',
      source: 'swr',
      details: `${log.operation} - ${log.key || 'unknown'}`,
      metadata: { operation: log.operation, key: log.key, cacheStatus: log.cacheStatus }
    });
  });

  // Revalidation operations
  getRevalidationLogs().forEach((log, i) => {
    allLogs.push({
      id: `reval_${i}`,
      timestamp: log.timestamp,
      type: 'invalidation',
      source: 'revalidation',
      details: `${log.type} - ${log.keys?.join(', ') || 'unknown'}`,
      metadata: { type: log.type, keys: log.keys, skipped: log.skipped }
    });
  });

  // Sort by timestamp (newest first) and limit
  return allLogs
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}

// ═══════════════════════════════════════════════════════════
// AGGREGATED DATA
// ═══════════════════════════════════════════════════════════

export function getObservabilityData(): ObservabilityData {
  return {
    firestore: getFirestoreMetrics(),
    kvCache: getKVCacheMetrics(),
    swr: getSWRMetrics(),
    revalidation: getRevalidationMetrics(),
    activityLogs: getActivityLogs(100),
    lastUpdated: new Date().toISOString(),
    // v2 features
    cost: getCostMetrics(),
    traces: getTraceSummary(),
    anomalies: getAnomalySummary(),
    performance: getPerformanceSummary()
  };
}

// ═══════════════════════════════════════════════════════════
// V2: COST METRICS
// ═══════════════════════════════════════════════════════════

export function getCostMetrics(): CostMetrics {
  const firestoreLogs = getFirestoreLogs();
  const writeLogs = getWriteLogs();
  const kvLogs = getKVLogs();

  // Firestore costs
  const firestoreReads = firestoreLogs.filter(l => l.source === 'firestore').length;
  const firestoreWrites = writeLogs.length;
  const firestoreCost = (firestoreReads * 0.06 / 100000) + (firestoreWrites * 0.18 / 100000);

  // KV costs
  const kvReads = kvLogs.filter(l => l.operation === 'get').length;
  const kvWrites = kvLogs.filter(l => l.operation === 'set').length;
  const kvCost = (kvReads * 0.50 / 1000000) + (kvWrites * 5.00 / 1000000);

  const totalCost = firestoreCost + kvCost;

  // Project costs (assuming current rate continues)
  const projectedDailyCost = totalCost * 24 * 60; // Assuming per-minute sampling
  const projectedMonthlyCost = projectedDailyCost * 30;

  return {
    totalCost,
    firestoreCost,
    kvCost,
    costByOperation: {
      'firestore_read': firestoreReads * 0.06 / 100000,
      'firestore_write': firestoreWrites * 0.18 / 100000,
      'kv_read': kvReads * 0.50 / 1000000,
      'kv_write': kvWrites * 5.00 / 1000000
    },
    projectedDailyCost,
    projectedMonthlyCost
  };
}

// ═══════════════════════════════════════════════════════════
// V2: TRACE SUMMARY
// ═══════════════════════════════════════════════════════════

export function getTraceSummary(): TraceSummary {
  // This would integrate with the event pipeline
  // For now, return summary from event buffer if available
  try {
    const eventBuffer = JSON.parse(sessionStorage.getItem('wind_event_buffer') || '[]');
    const traces = eventBuffer.filter((e: any) => e.traceId);
    
    const traceGroups = new Map<string, any[]>();
    traces.forEach((e: any) => {
      if (!traceGroups.has(e.traceId)) {
        traceGroups.set(e.traceId, []);
      }
      traceGroups.get(e.traceId)!.push(e);
    });

    const durations: number[] = [];
    const slowestTraces: any[] = [];

    traceGroups.forEach((events, traceId) => {
      const start = events[0]?.timestamp ? new Date(events[0].timestamp).getTime() : Date.now();
      const end = events[events.length - 1]?.timestamp ? new Date(events[events.length - 1].timestamp).getTime() : Date.now();
      const duration = end - start;
      
      durations.push(duration);
      slowestTraces.push({ traceId, duration, operation: events[0]?.type || 'unknown' });
    });

    slowestTraces.sort((a, b) => b.duration - a.duration);

    return {
      totalTraces: traceGroups.size,
      activeTraces: 0, // Would need real-time tracking
      averageTraceDuration: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
      slowestTraces: slowestTraces.slice(0, 10)
    };
  } catch {
    return {
      totalTraces: 0,
      activeTraces: 0,
      averageTraceDuration: 0,
      slowestTraces: []
    };
  }
}

// ═══════════════════════════════════════════════════════════
// V2: ANOMALY SUMMARY
// ═══════════════════════════════════════════════════════════

export function getAnomalySummary(): AnomalySummary {
  try {
    const anomalies = JSON.parse(sessionStorage.getItem('wind_anomalies') || '[]');
    
    return {
      totalAnomalies: anomalies.length,
      critical: anomalies.filter((a: any) => a.severity === 'critical').length,
      high: anomalies.filter((a: any) => a.severity === 'high').length,
      medium: anomalies.filter((a: any) => a.severity === 'medium').length,
      low: anomalies.filter((a: any) => a.severity === 'low').length,
      recentAnomalies: anomalies.slice(-10).map((a: any) => ({
        id: a.id,
        metric: a.metric,
        severity: a.severity,
        timestamp: a.timestamp
      }))
    };
  } catch {
    return {
      totalAnomalies: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      recentAnomalies: []
    };
  }
}

// ═══════════════════════════════════════════════════════════
// V2: PERFORMANCE SUMMARY
// ═══════════════════════════════════════════════════════════

export function getPerformanceSummary(): PerformanceSummary {
  try {
    const baselines = JSON.parse(sessionStorage.getItem('wind_performance_baselines') || '[]');
    const measurements = JSON.parse(sessionStorage.getItem('wind_performance_measurements') || '[]');
    
    const allDurations = measurements.map((m: any) => m.duration).filter((d: any) => d > 0);
    allDurations.sort((a: number, b: number) => a - b);
    
    const p50 = allDurations[Math.floor(allDurations.length * 0.5)] || 0;
    const p95 = allDurations[Math.floor(allDurations.length * 0.95)] || 0;
    const p99 = allDurations[Math.floor(allDurations.length * 0.99)] || 0;
    const avg = allDurations.length > 0 ? allDurations.reduce((a, b) => a + b, 0) / allDurations.length : 0;

    return {
      baselineOperations: baselines.length,
      regressionsDetected: 0, // Would need regression detection logic
      averageLatency: avg,
      p95Latency: p95,
      p99Latency: p99
    };
  } catch {
    return {
      baselineOperations: 0,
      regressionsDetected: 0,
      averageLatency: 0,
      p95Latency: 0,
      p99Latency: 0
    };
  }
}

// ═══════════════════════════════════════════════════════════
// MOCK DATA FOR DEVELOPMENT (when no real logs exist)
// ═══════════════════════════════════════════════════════════

export function getMockObservabilityData(): ObservabilityData {
  return {
    firestore: {
      readsToday: 1247,
      readsWeek: 8432,
      readsMonth: 32156,
      writesToday: 89,
      writesWeek: 543,
      writesMonth: 2341,
      topCollections: [
        { name: 'products', count: 4521 },
        { name: 'reviews', count: 2341 },
        { name: 'users', count: 1234 },
        { name: 'orders', count: 987 },
        { name: 'collections', count: 654 }
      ],
      quotaStatus: {
        status: 'healthy',
        readsThisMinute: 12,
        readsPerSecond: '0.20',
        projectedHourly: '720'
      }
    },
    kvCache: {
      cacheHits: 8934,
      cacheMisses: 1247,
      hitRate: 87.73,
      mostAccessedKeys: [
        { key: 'homepage_data_v2', count: 2341 },
        { key: 'product_stats_', count: 1876 },
        { key: 'site_settings_v2', count: 1234 },
        { key: 'collection_', count: 987 },
        { key: 'product_', count: 765 }
      ],
      backgroundRefreshes: 234,
      stampedePrevented: 45
    },
    swr: {
      totalFetches: 5678,
      dedupedRequests: 1234,
      inFlightRequests: 3,
      cacheHits: 4567,
      cacheMisses: 1111,
      averageResponseTime: 245.67
    },
    revalidation: {
      totalInvalidations: 234,
      byType: {
        product: 123,
        review: 45,
        homepage: 34,
        collection: 21,
        settings: 8,
        other: 3
      },
      skippedDueToCooldown: 56,
      averageResponseTime: 123.45
    },
    activityLogs: [
      {
        id: '1',
        timestamp: new Date().toISOString(),
        type: 'cache_hit',
        source: 'kv',
        details: 'get - homepage_data_v2',
        metadata: { operation: 'get', key: 'homepage_data_v2', hit: true }
      },
      {
        id: '2',
        timestamp: new Date(Date.now() - 5000).toISOString(),
        type: 'read',
        source: 'firestore',
        details: 'getProduct - products (1 docs)',
        metadata: { function: 'getProduct', collection: 'products', docCount: 1 }
      },
      {
        id: '3',
        timestamp: new Date(Date.now() - 10000).toISOString(),
        type: 'invalidation',
        source: 'revalidation',
        details: 'product_update - product_123, product_stats_shirt',
        metadata: { type: 'product_update', keys: ['product_123', 'product_stats_shirt'], skipped: false }
      }
    ],
    lastUpdated: new Date().toISOString(),
    // v2 mock data
    cost: {
      totalCost: 0.0234,
      firestoreCost: 0.0189,
      kvCost: 0.0045,
      costByOperation: {
        'firestore_read': 0.0007,
        'firestore_write': 0.0153,
        'kv_read': 0.0032,
        'kv_write': 0.0013
      },
      projectedDailyCost: 33.70,
      projectedMonthlyCost: 1011.00
    },
    traces: {
      totalTraces: 1234,
      activeTraces: 12,
      averageTraceDuration: 245,
      slowestTraces: [
        { traceId: 'trace-001', duration: 1234, operation: 'firestore_read' },
        { traceId: 'trace-002', duration: 987, operation: 'kv_get' },
        { traceId: 'trace-003', duration: 876, operation: 'swr_fetch' }
      ]
    },
    anomalies: {
      totalAnomalies: 23,
      critical: 2,
      high: 5,
      medium: 8,
      low: 8,
      recentAnomalies: [
        { id: 'anom-001', metric: 'firestoreReadsPerMinute', severity: 'critical', timestamp: new Date().toISOString() },
        { id: 'anom-002', metric: 'cacheHitRate', severity: 'high', timestamp: new Date(Date.now() - 60000).toISOString() }
      ]
    },
    performance: {
      baselineOperations: 45,
      regressionsDetected: 3,
      averageLatency: 245,
      p95Latency: 567,
      p99Latency: 1234
    }
  };
}

// ═══════════════════════════════════════════════════════════
// DEBUG MODE
// ═══════════════════════════════════════════════════════════

export const DEBUG_MODE = process.env.NEXT_PUBLIC_OBSERVABILITY_DEBUG === 'true';

export function logObservabilityEvent(type: string, data: any) {
  if (!DEBUG_MODE) return;
  console.log(`[OBSERVABILITY] ${type}:`, data);
}
