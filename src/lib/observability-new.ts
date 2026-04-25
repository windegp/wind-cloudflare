/**
 * Observability Data Aggregation Layer (Refactored)
 * 
 * Uses the new server-side event buffer for production-grade observability.
 * All data is sourced from the unified event pipeline.
 */

import { getEvents, getPipelineMetrics, migrateFromSessionStorage } from './observabilityBuffer';

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
  type: string;
  source: string;
  details: string;
  metadata?: Record<string, any>;
}

export interface CostMetrics {
  firestore: {
    reads: number;
    writes: number;
    cost: string;
  };
  kv: {
    reads: number;
    writes: number;
    cost: string;
  };
  total: string;
  projected: {
    daily: string;
    monthly: string;
  };
}

export interface TraceSummary {
  totalTraces: number;
  averageTraceDuration: number;
  slowestTraces: Array<{
    traceId: string;
    operation: string;
    duration: number;
  }>;
}

export interface AnomalySummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  recentAnomalies: Array<{
    timestamp: string;
    type: string;
    severity: string;
    details: string;
  }>;
}

export interface PerformanceSummary {
  averageFirestoreReadTime: number;
  averageKVCacheTime: number;
  averageSWRFetchTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
}

export interface ObservabilityData {
  firestore: FirestoreMetrics;
  kvCache: KVCacheMetrics;
  swr: SWRMetrics;
  revalidation: RevalidationMetrics;
  activityLogs: ActivityLog[];
  lastUpdated: string;
  cost: CostMetrics;
  traces: TraceSummary;
  anomalies: AnomalySummary;
  performance: PerformanceSummary;
}

// ═══════════════════════════════════════════════════════════
// DEBUG MODE
// ═══════════════════════════════════════════════════════════

export const DEBUG_MODE = process.env.NEXT_PUBLIC_OBSERVABILITY_DEBUG === 'true';

// ═══════════════════════════════════════════════════════════
// METRICS FUNCTIONS (Using new event buffer)
// ═══════════════════════════════════════════════════════════

export function getFirestoreMetrics(): FirestoreMetrics {
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;
  const oneMinuteAgo = now - 60 * 1000;

  // Get all Firestore events
  const firestoreEvents = getEvents({ type: 'firestore', limit: 5000 });
  const readEvents = firestoreEvents.filter(e => e.source === 'read');
  const writeEvents = firestoreEvents.filter(e => e.source === 'write');

  // Calculate time-based metrics
  const readsToday = readEvents.filter(e => e.timestamp > oneDayAgo).length;
  const readsWeek = readEvents.filter(e => e.timestamp > oneWeekAgo).length;
  const readsMonth = readEvents.filter(e => e.timestamp > oneMonthAgo).length;
  const readsThisMinute = readEvents.filter(e => e.timestamp > oneMinuteAgo).length;

  const writesToday = writeEvents.filter(e => e.timestamp > oneDayAgo).length;
  const writesWeek = writeEvents.filter(e => e.timestamp > oneWeekAgo).length;
  const writesMonth = writeEvents.filter(e => e.timestamp > oneMonthAgo).length;

  // Top collections
  const collectionCounts: Record<string, number> = {};
  readEvents.forEach(e => {
    if (e.collection) {
      collectionCounts[e.collection] = (collectionCounts[e.collection] || 0) + (e.count || 1);
    }
  });
  const topCollections = Object.entries(collectionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  // Quota status
  const timeInMinute = (now % 60000) / 1000;
  const readsPerSecond = readsThisMinute / Math.max(timeInMinute, 1);
  const projectedHourly = readsPerSecond * 3600;

  let status: 'healthy' | 'warning' | 'critical' | 'emergency' = 'healthy';
  if (readsThisMinute >= 200) status = 'emergency';
  else if (readsThisMinute >= 100) status = 'critical';
  else if (readsThisMinute >= 50) status = 'warning';

  return {
    readsToday,
    readsWeek,
    readsMonth,
    writesToday,
    writesWeek,
    writesMonth,
    topCollections,
    quotaStatus: {
      status,
      readsThisMinute,
      readsPerSecond: readsPerSecond.toFixed(2),
      projectedHourly: projectedHourly.toFixed(0)
    }
  };
}

export function getKVCacheMetrics(): KVCacheMetrics {
  const kvEvents = getEvents({ type: 'kv', limit: 5000 });
  
  const cacheHits = kvEvents.filter(e => e.source === 'cache_hit').length;
  const cacheMisses = kvEvents.filter(e => e.source === 'cache_miss').length;
  const total = cacheHits + cacheMisses;
  const hitRate = total > 0 ? (cacheHits / total) * 100 : 0;

  // Most accessed keys
  const keyCounts: Record<string, number> = {};
  kvEvents.forEach(e => {
    if (e.key) {
      keyCounts[e.key] = (keyCounts[e.key] || 0) + 1;
    }
  });
  const mostAccessedKeys = Object.entries(keyCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key, count]) => ({ key, count }));

  return {
    cacheHits,
    cacheMisses,
    hitRate: Math.round(hitRate * 100) / 100,
    mostAccessedKeys,
    backgroundRefreshes: 0, // Tracked separately
    stampedePrevented: 0 // Tracked separately
  };
}

export function getSWRMetrics(): SWRMetrics {
  const swrEvents = getEvents({ type: 'swr', limit: 5000 });
  
  const totalFetches = swrEvents.filter(e => e.source === 'fetch').length;
  const dedupedRequests = swrEvents.filter(e => e.source === 'dedupe').length;
  const cacheHits = swrEvents.filter(e => e.source === 'cache_hit').length;
  const cacheMisses = swrEvents.filter(e => e.source === 'cache_miss').length;

  // Calculate average response time
  const eventsWithDuration = swrEvents.filter(e => typeof e.duration === 'number');
  const averageResponseTime = eventsWithDuration.length > 0
    ? eventsWithDuration.reduce((sum, e) => sum + (e.duration || 0), 0) / eventsWithDuration.length
    : 0;

  return {
    totalFetches,
    dedupedRequests,
    inFlightRequests: 0, // Would need real-time tracking
    cacheHits,
    cacheMisses,
    averageResponseTime: Math.round(averageResponseTime * 100) / 100
  };
}

export function getRevalidationMetrics(): RevalidationMetrics {
  const revalEvents = getEvents({ type: 'revalidate', limit: 5000 });
  const invalidationEvents = revalEvents.filter(e => e.source === 'invalidation');

  const totalInvalidations = invalidationEvents.length;

  // Count by type from metadata
  const byType = {
    product: 0,
    review: 0,
    homepage: 0,
    collection: 0,
    settings: 0,
    other: 0
  };

  invalidationEvents.forEach(e => {
    const reason = e.metadata?.reason || '';
    if (reason.includes('product')) byType.product++;
    else if (reason.includes('review')) byType.review++;
    else if (reason.includes('homepage')) byType.homepage++;
    else if (reason.includes('collection')) byType.collection++;
    else if (reason.includes('settings')) byType.settings++;
    else byType.other++;
  });

  const skippedDueToCooldown = invalidationEvents
    .filter(e => e.metadata?.skipped > 0)
    .reduce((sum, e) => sum + (e.metadata?.skipped || 0), 0);

  const eventsWithDuration = invalidationEvents.filter(e => typeof e.duration === 'number');
  const averageResponseTime = eventsWithDuration.length > 0
    ? eventsWithDuration.reduce((sum, e) => sum + (e.duration || 0), 0) / eventsWithDuration.length
    : 0;

  return {
    totalInvalidations,
    byType,
    skippedDueToCooldown,
    averageResponseTime: Math.round(averageResponseTime * 100) / 100
  };
}

export function getActivityLogs(limit = 50): ActivityLog[] {
  const events = getEvents({ limit: limit * 2 }); // Get more to ensure we have enough after filtering

  return events.slice(0, limit).map(event => {
    let details = '';
    let type = event.source || 'unknown';

    switch (event.type) {
      case 'firestore':
        details = `${event.function || 'unknown'} - ${event.collection || 'unknown'} (${event.count || 1} docs)`;
        type = event.source === 'read' ? 'read' : 'write';
        break;
      case 'kv':
        details = `${event.source || 'unknown'} - ${event.key || 'unknown'}`;
        type = event.source === 'cache_hit' || event.source === 'cache_miss' 
          ? event.source 
          : 'kv_op';
        break;
      case 'swr':
        details = `${event.source || 'unknown'} - ${event.key || 'unknown'}`;
        type = 'swr_fetch';
        break;
      case 'revalidate':
        details = `${event.metadata?.reason || 'unknown'} - ${event.metadata?.keys?.join(', ') || 'unknown'}`;
        type = 'invalidation';
        break;
      case 'error':
        details = event.metadata?.message || 'Error occurred';
        type = 'error';
        break;
      default:
        details = `${event.type} - ${event.source || 'unknown'}`;
    }

    return {
      id: event.id || `evt_${event.timestamp}`,
      timestamp: new Date(event.timestamp).toISOString(),
      type,
      source: event.type,
      details,
      metadata: event.metadata
    };
  });
}

// ═══════════════════════════════════════════════════════════
// V2: COST METRICS
// ═══════════════════════════════════════════════════════════

export function getCostMetrics(): CostMetrics {
  const pipelineMetrics = getPipelineMetrics();
  
  // Get Firestore reads from pipeline
  const firestoreReads = pipelineMetrics.byType.firestore || 0;
  const firestoreWrites = pipelineMetrics.byType['firestore-write'] || 0;
  
  // Firestore pricing: $0.06 per 100k reads, $0.18 per 100k writes
  const firestoreCost = (firestoreReads * 0.06 / 100000) + (firestoreWrites * 0.18 / 100000);

  // KV pricing: $0.50 per 1M reads, $5.00 per 1M writes
  const kvReads = (pipelineMetrics.byType.kv || 0) + (pipelineMetrics.byType['kv-hit'] || 0);
  const kvWrites = pipelineMetrics.byType['kv-miss'] || 0;
  const kvCost = (kvReads * 0.50 / 1000000) + (kvWrites * 5.00 / 1000000);

  const totalCost = firestoreCost + kvCost;

  // Projections based on current rate
  const eventsPerSecond = pipelineMetrics.eventsPerSecond || 0;
  const projectedDailyCost = totalCost * (86400 / Math.max(eventsPerSecond, 1)) * eventsPerSecond;
  const projectedMonthlyCost = projectedDailyCost * 30;

  return {
    firestore: {
      reads: firestoreReads,
      writes: firestoreWrites,
      cost: `$${firestoreCost.toFixed(6)}`
    },
    kv: {
      reads: kvReads,
      writes: kvWrites,
      cost: `$${kvCost.toFixed(6)}`
    },
    total: `$${totalCost.toFixed(6)}`,
    projected: {
      daily: `$${projectedDailyCost.toFixed(2)}`,
      monthly: `$${projectedMonthlyCost.toFixed(2)}`
    }
  };
}

export function getTraceSummary(): TraceSummary {
  const pipelineMetrics = getPipelineMetrics();
  return pipelineMetrics.traceSummary || {
    totalTraces: 0,
    averageTraceDuration: 0,
    slowestTraces: []
  };
}

export function getAnomalySummary(): AnomalySummary {
  const anomalyEvents = getEvents({ type: 'anomaly', limit: 100 });
  
  const bySeverity = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0
  };

  const recentAnomalies = anomalyEvents.slice(0, 10).map(e => ({
    timestamp: new Date(e.timestamp).toISOString(),
    type: e.source || 'unknown',
    severity: e.severity || 'medium',
    details: e.metadata?.details || 'Anomaly detected'
  }));

  anomalyEvents.forEach(e => {
    if (e.severity) {
      bySeverity[e.severity as keyof typeof bySeverity]++;
    }
  });

  return {
    total: anomalyEvents.length,
    ...bySeverity,
    recentAnomalies
  };
}

export function getPerformanceSummary(): PerformanceSummary {
  const firestoreEvents = getEvents({ type: 'firestore', limit: 1000 });
  const kvEvents = getEvents({ type: 'kv', limit: 1000 });
  const swrEvents = getEvents({ type: 'swr', limit: 1000 });

  const calculateAvg = (events: typeof firestoreEvents) => {
    const withDuration = events.filter(e => typeof e.duration === 'number');
    return withDuration.length > 0
      ? withDuration.reduce((sum, e) => sum + (e.duration || 0), 0) / withDuration.length
      : 0;
  };

  const allDurations = [
    ...firestoreEvents.map(e => e.duration || 0),
    ...kvEvents.map(e => e.duration || 0),
    ...swrEvents.map(e => e.duration || 0)
  ].filter(d => d > 0).sort((a, b) => a - b);

  const p95Index = Math.floor(allDurations.length * 0.95);
  const p99Index = Math.floor(allDurations.length * 0.99);

  return {
    averageFirestoreReadTime: Math.round(calculateAvg(firestoreEvents) * 100) / 100,
    averageKVCacheTime: Math.round(calculateAvg(kvEvents) * 100) / 100,
    averageSWRFetchTime: Math.round(calculateAvg(swrEvents) * 100) / 100,
    p95ResponseTime: Math.round((allDurations[p95Index] || 0) * 100) / 100,
    p99ResponseTime: Math.round((allDurations[p99Index] || 0) * 100) / 100
  };
}

// ═══════════════════════════════════════════════════════════
// AGGREGATED DATA
// ═══════════════════════════════════════════════════════════

export function getObservabilityData(): ObservabilityData {
  // Migrate legacy data if needed (client-side only)
  if (typeof window !== 'undefined') {
    migrateFromSessionStorage('wind_firestore_reads');
    migrateFromSessionStorage('wind_kv_operations');
    migrateFromSessionStorage('wind_swr_operations');
  }

  return {
    firestore: getFirestoreMetrics(),
    kvCache: getKVCacheMetrics(),
    swr: getSWRMetrics(),
    revalidation: getRevalidationMetrics(),
    activityLogs: getActivityLogs(100),
    lastUpdated: new Date().toISOString(),
    cost: getCostMetrics(),
    traces: getTraceSummary(),
    anomalies: getAnomalySummary(),
    performance: getPerformanceSummary()
  };
}

// ═══════════════════════════════════════════════════════════
// MOCK DATA (For development/testing)
// ═══════════════════════════════════════════════════════════

export function getMockObservabilityData(): ObservabilityData {
  return {
    firestore: {
      readsToday: 1234,
      readsWeek: 8901,
      readsMonth: 45678,
      writesToday: 56,
      writesWeek: 345,
      writesMonth: 1234,
      topCollections: [
        { name: 'products', count: 567 },
        { name: 'orders', count: 234 },
        { name: 'customers', count: 123 },
        { name: 'reviews', count: 89 },
        { name: 'collections', count: 45 }
      ],
      quotaStatus: {
        status: 'healthy',
        readsThisMinute: 12,
        readsPerSecond: '0.20',
        projectedHourly: '720'
      }
    },
    kvCache: {
      cacheHits: 4567,
      cacheMisses: 234,
      hitRate: 95.1,
      mostAccessedKeys: [
        { key: 'homepage_data_v2', count: 1234 },
        { key: 'products_list', count: 567 },
        { key: 'site_settings', count: 234 }
      ],
      backgroundRefreshes: 45,
      stampedePrevented: 12
    },
    swr: {
      totalFetches: 890,
      dedupedRequests: 234,
      inFlightRequests: 3,
      cacheHits: 567,
      cacheMisses: 123,
      averageResponseTime: 145
    },
    revalidation: {
      totalInvalidations: 45,
      byType: {
        product: 23,
        review: 12,
        homepage: 4,
        collection: 3,
        settings: 2,
        other: 1
      },
      skippedDueToCooldown: 8,
      averageResponseTime: 67
    },
    activityLogs: [
      {
        id: '1',
        timestamp: new Date().toISOString(),
        type: 'read',
        source: 'firestore',
        details: 'getProducts - products (20 docs)',
        metadata: { function: 'getProducts', collection: 'products', docCount: 20 }
      }
    ],
    lastUpdated: new Date().toISOString(),
    cost: {
      firestore: { reads: 1234, writes: 56, cost: '$0.000740' },
      kv: { reads: 4567, writes: 234, cost: '$0.003402' },
      total: '$0.004142',
      projected: { daily: '$0.10', monthly: '$3.00' }
    },
    traces: {
      totalTraces: 156,
      averageTraceDuration: 234,
      slowestTraces: [
        { traceId: 'abc123', operation: 'getProductDetails', duration: 1200 },
        { traceId: 'def456', operation: 'getCollectionProducts', duration: 980 }
      ]
    },
    anomalies: {
      total: 3,
      critical: 0,
      high: 1,
      medium: 1,
      low: 1,
      recentAnomalies: [
        {
          timestamp: new Date(Date.now() - 300000).toISOString(),
          type: 'quota_spike',
          severity: 'high',
          details: 'Firestore reads spiked to 150/min'
        }
      ]
    },
    performance: {
      averageFirestoreReadTime: 145,
      averageKVCacheTime: 12,
      averageSWRFetchTime: 89,
      p95ResponseTime: 450,
      p99ResponseTime: 890
    }
  };
}
