/**
 * Observability Event Ingestion API
 * 
 * Receives events from client-side systems and adds them to the server buffer.
 * Supports batch ingestion for efficiency.
 * 
 * POST /api/observability/ingest
 * Body: { events: Array<ObservabilityEvent> } or single event
 */

import { addEvent, getPipelineMetrics } from '@/lib/observabilityBuffer';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

/**
 * Validates an incoming event
 * @param {Object} event
 * @returns {boolean}
 */
function isValidEvent(event) {
  return (
    event &&
    typeof event === 'object' &&
    typeof event.type === 'string' &&
    event.type.length > 0 &&
    typeof event.timestamp === 'number'
  );
}

/**
 * Sanitizes event data to prevent injection
 * @param {Object} event
 * @returns {Object}
 */
function sanitizeEvent(event) {
  const allowedTypes = [
    'firestore', 'kv', 'swr', 'revalidate', 'error', 'trace', 
    'anomaly', 'performance', 'cost', 'cache_hit', 'cache_miss'
  ];

  const allowedSources = [
    'read', 'write', 'cache_hit', 'cache_miss', 'invalidation', 
    'fetch', 'dedupe', 'background_refresh', 'error', 'slow_query'
  ];

  return {
    type: allowedTypes.includes(event.type) ? event.type : 'unknown',
    source: allowedSources.includes(event.source) ? event.source : 'unknown',
    timestamp: Math.min(Date.now(), Math.max(0, event.timestamp || Date.now())),
    collection: typeof event.collection === 'string' ? event.collection.slice(0, 100) : undefined,
    function: typeof event.function === 'string' ? event.function.slice(0, 100) : undefined,
    key: typeof event.key === 'string' ? event.key.slice(0, 200) : undefined,
    duration: typeof event.duration === 'number' ? Math.max(0, event.duration) : undefined,
    count: typeof event.count === 'number' ? Math.max(0, Math.min(event.count, 10000)) : undefined,
    traceId: typeof event.traceId === 'string' ? event.traceId.slice(0, 50) : undefined,
    severity: ['low', 'medium', 'high', 'critical'].includes(event.severity) ? event.severity : undefined,
    metadata: typeof event.metadata === 'object' && event.metadata !== null 
      ? JSON.parse(JSON.stringify(event.metadata).slice(0, 1000)) 
      : undefined
  };
}

export async function POST(request) {
  try {
    const body = await request.json();

    // Support both single event and batch
    const events = Array.isArray(body.events) ? body.events : [body];

    if (events.length === 0) {
      return Response.json(
        { error: 'No events provided' },
        { status: 400 }
      );
    }

    if (events.length > 100) {
      return Response.json(
        { error: 'Batch size too large (max 100)' },
        { status: 400 }
      );
    }

    // Process events
    const results = [];
    const errors = [];

    for (const event of events) {
      try {
        if (!isValidEvent(event)) {
          errors.push({ event, reason: 'Invalid event structure' });
          continue;
        }

        const sanitized = sanitizeEvent(event);
        const added = addEvent(sanitized);
        results.push(added.id);
      } catch (err) {
        errors.push({ event, reason: err.message });
      }
    }

    // Get current metrics for response
    const metrics = getPipelineMetrics();

    return Response.json({
      success: true,
      ingested: results.length,
      failed: errors.length,
      eventIds: results,
      errors: errors.length > 0 ? errors : undefined,
      metrics: {
        totalEvents: metrics.totalEvents,
        eventsPerSecond: metrics.eventsPerSecond
      }
    });

  } catch (err) {
    console.error('[Observability Ingest] Error:', err);
    return Response.json(
      { error: 'Failed to ingest events', message: err.message },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint for health check and metrics
 */
export async function GET() {
  const metrics = getPipelineMetrics();
  
  return Response.json({
    status: 'healthy',
    metrics: {
      totalEvents: metrics.totalEvents,
      eventsPerSecond: metrics.eventsPerSecond,
      byType: metrics.byType
    }
  });
}
