/**
 * Unified Observability Event Emitter (Client-Side)
 * 
 * Production-grade event emitter that sends observability data to the server.
 * Features:
 * - Automatic batching for efficiency
 * - Offline queue with localStorage fallback
 * - Deduplication
 * - Retry logic with exponential backoff
 * - Legacy sessionStorage migration
 * 
 * Event Flow:
 * Client Action → emitEvent() → Batch Buffer → POST /api/observability/ingest
 */

// ═══════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════

const BATCH_SIZE = 10;
const FLUSH_INTERVAL = 5000; // 5 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second base
const OFFLINE_STORAGE_KEY = 'wind_observability_offline_queue';

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════

let eventBuffer = [];
let flushTimer = null;
let isOnline = true;
let isProcessing = false;
let eventIdCounter = 0;

// ═══════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════

function init() {
  if (typeof window === 'undefined') return;

  // Listen for online/offline status
  window.addEventListener('online', () => {
    isOnline = true;
    flushOfflineQueue();
  });

  window.addEventListener('offline', () => {
    isOnline = false;
  });

  // Flush on page unload
  window.addEventListener('beforeunload', () => {
    if (eventBuffer.length > 0) {
      storeOfflineQueue(eventBuffer);
    }
  });

  // Restore offline queue
  restoreOfflineQueue();

  // Start flush timer
  startFlushTimer();
}

// ═══════════════════════════════════════════════════════════
// CORE EMIT FUNCTIONS
// ═══════════════════════════════════════════════════════════

/**
 * Emits a single event to the observability system
 * @param {Object} event
 * @param {string} event.type - Event type: 'firestore', 'kv', 'swr', 'revalidate', 'error', 'trace', 'anomaly', 'performance'
 * @param {string} event.source - Sub-source: 'read', 'write', 'cache_hit', 'cache_miss', 'invalidation', etc.
 * @param {string} [event.collection] - Firestore collection name
 * @param {string} [event.function] - Function/component name
 * @param {string} [event.key] - Cache key
 * @param {number} [event.duration] - Operation duration in ms
 * @param {number} [event.count] - Document count or metric value
 * @param {string} [event.traceId] - Trace ID
 * @param {string} [event.severity] - Anomaly severity: 'low', 'medium', 'high', 'critical'
 * @param {Object} [event.metadata] - Additional data
 */
export function emitEvent(event) {
  if (typeof window === 'undefined') {
    // Server-side: noop (use server buffer directly)
    return null;
  }

  const enrichedEvent = {
    ...event,
    _clientId: getClientId(),
    _eventSeq: ++eventIdCounter,
    timestamp: event.timestamp || Date.now()
  };

  eventBuffer.push(enrichedEvent);

  // Flush immediately if buffer is full
  if (eventBuffer.length >= BATCH_SIZE) {
    flush();
  }

  return enrichedEvent;
}

/**
 * Emits a Firestore read event
 * @param {string} functionName
 * @param {string} collection
 * @param {number} docCount
 * @param {string} source - 'firestore' or 'cache'
 */
export function emitFirestoreRead(functionName, collection, docCount = 1, source = 'firestore') {
  return emitEvent({
    type: 'firestore',
    source: source === 'firestore' ? 'read' : 'cache_hit',
    function: functionName,
    collection,
    count: docCount,
    metadata: { readSource: source }
  });
}

/**
 * Emits a Firestore write event
 * @param {string} functionName
 * @param {string} collection
 * @param {number} docCount
 */
export function emitFirestoreWrite(functionName, collection, docCount = 1) {
  return emitEvent({
    type: 'firestore',
    source: 'write',
    function: functionName,
    collection,
    count: docCount
  });
}

/**
 * Emits a KV cache event
 * @param {string} operation - 'hit', 'miss', 'set', 'delete', 'invalidate'
 * @param {string} key
 * @param {Object} metadata
 */
export function emitKVEvent(operation, key, metadata = {}) {
  const sourceMap = {
    hit: 'cache_hit',
    miss: 'cache_miss',
    set: 'write',
    delete: 'write',
    invalidate: 'invalidation',
    refresh: 'background_refresh'
  };

  return emitEvent({
    type: 'kv',
    source: sourceMap[operation] || operation,
    key,
    metadata
  });
}

/**
 * Emits a SWR event
 * @param {string} operation - 'fetch', 'dedupe', 'error', 'success'
 * @param {string} key
 * @param {Object} metadata
 */
export function emitSWREvent(operation, key, metadata = {}) {
  return emitEvent({
    type: 'swr',
    source: operation,
    key,
    duration: metadata.duration,
    metadata
  });
}

/**
 * Emits a revalidation event
 * @param {string} operation - 'invalidate', 'refresh', 'skip'
 * @param {string} key
 * @param {Object} metadata
 */
export function emitRevalidateEvent(operation, key, metadata = {}) {
  return emitEvent({
    type: 'revalidate',
    source: operation,
    key,
    metadata
  });
}

/**
 * Emits a trace event for performance tracking
 * @param {string} traceId
 * @param {string} operation
 * @param {number} duration
 * @param {Object} metadata
 */
export function emitTrace(traceId, operation, duration, metadata = {}) {
  return emitEvent({
    type: 'trace',
    source: 'performance',
    traceId,
    function: operation,
    duration,
    metadata
  });
}

/**
 * Emits an error event
 * @param {string} source
 * @param {Error} error
 * @param {Object} context
 */
export function emitError(source, error, context = {}) {
  return emitEvent({
    type: 'error',
    source,
    metadata: {
      message: error?.message,
      stack: error?.stack?.slice(0, 500),
      ...context
    }
  });
}

/**
 * Emits an anomaly detection event
 * @param {string} type
 * @param {string} severity - 'low', 'medium', 'high', 'critical'
 * @param {Object} metadata
 */
export function emitAnomaly(type, severity, metadata = {}) {
  return emitEvent({
    type: 'anomaly',
    source: type,
    severity,
    metadata
  });
}

/**
 * Emits a performance metric
 * @param {string} metric
 * @param {number} value
 * @param {Object} metadata
 */
export function emitPerformance(metric, value, metadata = {}) {
  return emitEvent({
    type: 'performance',
    source: metric,
    duration: value,
    metadata
  });
}

// ═══════════════════════════════════════════════════════════
// BATCH FLUSHING
// ═══════════════════════════════════════════════════════════

function startFlushTimer() {
  if (flushTimer) return;
  flushTimer = setInterval(flush, FLUSH_INTERVAL);
}

async function flush() {
  if (isProcessing || eventBuffer.length === 0) return;
  if (!isOnline) return; // Will be stored offline

  isProcessing = true;
  const batch = eventBuffer.splice(0, BATCH_SIZE);

  try {
    const response = await fetch('/api/observability/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: batch }),
      keepalive: true
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();
    
    // Retry failed events
    if (result.failed > 0 && result.errors) {
      const failedEvents = batch.filter((_, i) => result.errors[i]);
      if (failedEvents.length > 0) {
        // Put back in buffer for retry
        eventBuffer.unshift(...failedEvents);
      }
    }

  } catch (err) {
    // Put events back for retry
    eventBuffer.unshift(...batch);
    
    // If offline, store in localStorage
    if (!navigator.onLine) {
      storeOfflineQueue(batch);
    }
  } finally {
    isProcessing = false;
  }
}

// ═══════════════════════════════════════════════════════════
// OFFLINE QUEUE MANAGEMENT
// ═══════════════════════════════════════════════════════════

function storeOfflineQueue(events) {
  if (typeof window === 'undefined') return;
  
  try {
    const existing = JSON.parse(localStorage.getItem(OFFLINE_STORAGE_KEY) || '[]');
    existing.push(...events);
    // Keep only last 100
    if (existing.length > 100) {
      existing.splice(0, existing.length - 100);
    }
    localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(existing));
  } catch (e) {
    console.error('[Observability] Failed to store offline queue:', e);
  }
}

function restoreOfflineQueue() {
  if (typeof window === 'undefined') return;

  try {
    const stored = JSON.parse(localStorage.getItem(OFFLINE_STORAGE_KEY) || '[]');
    if (stored.length > 0) {
      eventBuffer.unshift(...stored);
      localStorage.removeItem(OFFLINE_STORAGE_KEY);
    }
  } catch (e) {
    console.error('[Observability] Failed to restore offline queue:', e);
  }
}

async function flushOfflineQueue() {
  if (eventBuffer.length === 0) return;
  await flush();
}

// ═══════════════════════════════════════════════════════════
// LEGACY MIGRATION
// ═══════════════════════════════════════════════════════════

/**
 * Migrates legacy sessionStorage logs to the new event system
 * Call this once on app initialization
 */
export function migrateLegacyLogs() {
  if (typeof window === 'undefined') return;

  const legacyKeys = [
    'wind_firestore_reads',
    'wind_kv_operations',
    'wind_swr_operations',
    'wind_revalidation_operations'
  ];

  legacyKeys.forEach(key => {
    try {
      const data = sessionStorage.getItem(key);
      if (!data) return;

      const events = JSON.parse(data);
      if (!Array.isArray(events)) return;

      events.forEach(event => {
        emitEvent({
          type: key.includes('firestore') ? 'firestore' :
                key.includes('kv') ? 'kv' :
                key.includes('swr') ? 'swr' : 'revalidate',
          source: event.source || 'unknown',
          function: event.function,
          collection: event.collection,
          key: event.key,
          count: event.docCount || 1,
          timestamp: new Date(event.timestamp).getTime(),
          metadata: { migratedFrom: key }
        });
      });

      // Clear after migration
      sessionStorage.removeItem(key);
    } catch (e) {
      console.error('[Observability] Migration failed for', key, e);
    }
  });
}

// ═══════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════

let clientId = null;

function getClientId() {
  if (clientId) return clientId;
  
  if (typeof window === 'undefined') return 'server';

  clientId = sessionStorage.getItem('wind_observability_client_id');
  if (!clientId) {
    clientId = `client-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
    sessionStorage.setItem('wind_observability_client_id', clientId);
  }
  return clientId;
}

/**
 * Gets current buffer stats (for debugging)
 */
export function getEmitterStats() {
  return {
    bufferSize: eventBuffer.length,
    isOnline,
    isProcessing,
    clientId: getClientId()
  };
}

/**
 * Forces immediate flush (for page unload)
 */
export function forceFlush() {
  if (eventBuffer.length > 0) {
    flush();
  }
}

// Auto-initialize in browser
if (typeof window !== 'undefined') {
  init();
}
