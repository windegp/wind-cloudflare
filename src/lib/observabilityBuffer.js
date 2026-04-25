/**
 * Server-Side Observability Event Buffer
 * 
 * Production-grade event storage for the observability system.
 * Uses in-memory buffer for Edge runtime with KV persistence.
 * 
 * Architecture:
 * - In-memory circular buffer (server-side, Edge-compatible)
 * - KV persistence for cross-request durability
 * - Automatic cleanup and deduplication
 * - Real-time metrics aggregation
 */

import { getKV } from './kv-cache';

// ═══════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════

const BUFFER_SIZE = 5000; // Max events in memory
const KV_KEY = 'wind_observability_events';
const KV_TTL = 3600; // 1 hour
const METRICS_WINDOW_MS = 60000; // 1 minute for rate calculations

// ═══════════════════════════════════════════════════════════
// IN-MEMORY STATE (Edge Runtime Compatible)
// ═══════════════════════════════════════════════════════════

/** @type {Array<ObservabilityEvent>} */
const memoryBuffer = [];

/** @type {Map<string, number>} */
const metricsCache = new Map();

/** @type {number} */
let lastKVSYNC = 0;

const KV_SYNC_INTERVAL = 30000; // Sync to KV every 30s

// ═══════════════════════════════════════════════════════════
// TYPES (JSDoc for type safety without TypeScript)
// ═══════════════════════════════════════════════════════════

/**
 * @typedef {Object} ObservabilityEvent
 * @property {string} id - Unique event ID
 * @property {string} type - Event type: 'firestore', 'kv', 'swr', 'revalidate', 'error', 'trace', 'anomaly'
 * @property {string} source - Sub-source: 'read', 'write', 'cache_hit', 'cache_miss', 'invalidation', etc.
 * @property {number} timestamp - Unix timestamp (ms)
 * @property {string} [collection] - Firestore collection (if applicable)
 * @property {string} [function] - Function/component name
 * @property {string} [key] - Cache key (if applicable)
 * @property {number} [duration] - Operation duration in ms
 * @property {number} [count] - Document count or metric value
 * @property {string} [traceId] - Trace ID for distributed tracing
 * @property {string} [severity] - For anomalies: 'low', 'medium', 'high', 'critical'
 * @property {Object} [metadata] - Additional arbitrary data
 */

/**
 * @typedef {Object} PipelineMetrics
 * @property {number} totalEvents
 * @property {number} eventsPerSecond
 * @property {Object} byType
 * @property {Array<ObservabilityEvent>} recentEvents
 * @property {Array<ObservabilityEvent>} anomalies
 * @property {Object} costMetrics
 * @property {Object} traceSummary
 */

// ═══════════════════════════════════════════════════════════
// CORE BUFFER OPERATIONS
// ═══════════════════════════════════════════════════════════

/**
 * Adds an event to the buffer
 * @param {ObservabilityEvent} event
 */
export function addEvent(event) {
  const enrichedEvent = {
    ...event,
    id: generateEventId(),
    timestamp: event.timestamp || Date.now(),
    _ingestedAt: Date.now()
  };

  // Add to memory buffer (circular)
  memoryBuffer.push(enrichedEvent);
  if (memoryBuffer.length > BUFFER_SIZE) {
    memoryBuffer.shift(); // Remove oldest
  }

  // Periodic KV sync (don't block)
  const now = Date.now();
  if (now - lastKVSYNC > KV_SYNC_INTERVAL) {
    lastKVSYNC = now;
    syncToKV().catch(() => {}); // Non-blocking
  }

  return enrichedEvent;
}

/**
 * Gets events from buffer with optional filtering
 * @param {Object} options
 * @param {string} [options.type] - Filter by type
 * @param {string} [options.source] - Filter by source
 * @param {number} [options.limit=100] - Max events to return
 * @param {number} [options.since] - Timestamp to get events after
 * @returns {Array<ObservabilityEvent>}
 */
export function getEvents(options = {}) {
  const { type, source, limit = 100, since } = options;

  let events = [...memoryBuffer];

  if (type) {
    events = events.filter(e => e.type === type);
  }
  if (source) {
    events = events.filter(e => e.source === source);
  }
  if (since) {
    events = events.filter(e => e.timestamp > since);
  }

  return events.slice(-limit).reverse(); // Most recent first
}

/**
 * Gets current pipeline metrics
 * @returns {PipelineMetrics}
 */
export function getPipelineMetrics() {
  const now = Date.now();
  const windowStart = now - METRICS_WINDOW_MS;

  const recentEvents = memoryBuffer.filter(e => e.timestamp > windowStart);
  const eventsPerSecond = recentEvents.length / (METRICS_WINDOW_MS / 1000);

  // Count by type
  const byType = {};
  memoryBuffer.forEach(e => {
    byType[e.type] = (byType[e.type] || 0) + 1;
  });

  // Get anomalies
  const anomalies = memoryBuffer
    .filter(e => e.type === 'anomaly')
    .slice(-10);

  // Calculate cost metrics (Firestore reads)
  const firestoreEvents = memoryBuffer.filter(e => e.type === 'firestore');
  const totalReads = firestoreEvents
    .filter(e => e.source === 'read')
    .reduce((sum, e) => sum + (e.count || 1), 0);

  // Calculate trace metrics
  const traces = memoryBuffer.filter(e => e.type === 'trace');
  const traceDurations = traces.map(t => t.duration || 0);
  const avgTraceDuration = traceDurations.length > 0
    ? traceDurations.reduce((a, b) => a + b, 0) / traceDurations.length
    : 0;
  const slowestTraces = [...traces]
    .sort((a, b) => (b.duration || 0) - (a.duration || 0))
    .slice(0, 5);

  // Error metrics
  const errors = memoryBuffer.filter(e => e.type === 'error');

  return {
    totalEvents: memoryBuffer.length,
    eventsPerSecond: parseFloat(eventsPerSecond.toFixed(2)),
    byType,
    recentEvents: recentEvents.slice(-20),
    anomalies,
    costMetrics: {
      totalReads,
      estimatedCost: (totalReads * 0.00006).toFixed(4), // $0.06 per 1000 reads
      projectedMonthly: ((totalReads * 60 * 24 * 30) * 0.00006).toFixed(2)
    },
    traceSummary: {
      totalTraces: traces.length,
      averageTraceDuration: parseFloat(avgTraceDuration.toFixed(2)),
      slowestTraces: slowestTraces.map(t => ({
        traceId: t.traceId,
        operation: t.function,
        duration: t.duration
      }))
    },
    errorMetrics: {
      totalErrors: errors.length,
      errorsPerMinute: errors.filter(e => e.timestamp > windowStart).length
    }
  };
}

/**
 * Clears all events from buffer
 */
export function clearBuffer() {
  memoryBuffer.length = 0;
  metricsCache.clear();
}

/**
 * Gets buffer statistics
 * @returns {Object}
 */
export function getBufferStats() {
  return {
    size: memoryBuffer.length,
    maxSize: BUFFER_SIZE,
    utilization: (memoryBuffer.length / BUFFER_SIZE * 100).toFixed(1) + '%',
    oldestEvent: memoryBuffer[0]?.timestamp || null,
    newestEvent: memoryBuffer[memoryBuffer.length - 1]?.timestamp || null
  };
}

// ═══════════════════════════════════════════════════════════
// KV PERSISTENCE (Non-blocking)
// ═══════════════════════════════════════════════════════════

/**
 * Syncs buffer to KV for durability
 * @private
 */
async function syncToKV() {
  if (memoryBuffer.length === 0) return;

  try {
    const kv = await getKV();
    if (!kv) return;

    const data = {
      events: memoryBuffer.slice(-1000), // Last 1000 events
      syncedAt: Date.now(),
      count: memoryBuffer.length
    };

    await kv.put(KV_KEY, JSON.stringify(data), { expirationTtl: KV_TTL });
  } catch (err) {
    console.error('[Observability] KV sync failed:', err);
  }
}

/**
 * Restores events from KV (call on server start)
 */
export async function restoreFromKV() {
  try {
    const kv = await getKV();
    if (!kv) return;

    const data = await kv.get(KV_KEY);
    if (data && data.events) {
      // Merge with current buffer, avoiding duplicates
      const existingIds = new Set(memoryBuffer.map(e => e.id));
      const newEvents = data.events.filter(e => !existingIds.has(e.id));
      memoryBuffer.push(...newEvents);

      // Trim to max size
      if (memoryBuffer.length > BUFFER_SIZE) {
        memoryBuffer.splice(0, memoryBuffer.length - BUFFER_SIZE);
      }
    }
  } catch (err) {
    console.error('[Observability] KV restore failed:', err);
  }
}

// ═══════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════

function generateEventId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

// ═══════════════════════════════════════════════════════════
// LEGACY COMPATIBILITY
// ═══════════════════════════════════════════════════════════

/**
 * Adapter for legacy sessionStorage-based code
 * Migrates sessionStorage events to server buffer
 * @param {string} key - sessionStorage key
 */
export function migrateFromSessionStorage(key) {
  if (typeof window === 'undefined') return;

  try {
    const data = sessionStorage.getItem(key);
    if (!data) return;

    const events = JSON.parse(data);
    if (!Array.isArray(events)) return;

    events.forEach(event => {
      addEvent({
        type: 'firestore',
        source: event.source || 'read',
        collection: event.collection,
        function: event.function,
        count: event.docCount,
        timestamp: new Date(event.timestamp).getTime(),
        metadata: { migratedFrom: 'sessionStorage' }
      });
    });

    // Clear after migration
    sessionStorage.removeItem(key);
  } catch (e) {
    console.error('[Observability] Migration failed:', e);
  }
}
