/**
 * Real-time Observability Stream API
 * Provides Server-Sent Events (SSE) for live dashboard updates
 * 
 * Uses server-side event buffer - no sessionStorage dependency
 * Supports automatic reconnect and heartbeat
 */

import { getPipelineMetrics, getEvents } from '@/lib/observabilityBuffer';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

const HEARTBEAT_INTERVAL = 30000; // 30s heartbeat
const UPDATE_INTERVAL = 1000; // 1s updates
const MAX_STREAM_DURATION = 300000; // 5 min max connection

export async function GET(request) {
  const url = new URL(request.url);
  const clientId = url.searchParams.get('clientId') || 'unknown';
  const lastEventId = request.headers.get('Last-Event-ID') || url.searchParams.get('lastEventId');

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const startTime = Date.now();
      let isActive = true;

      // Send SSE headers
      controller.enqueue(encoder.encode(':ok\n\n'));

      // Send initial data with connection ID
      const initialData = {
        type: 'init',
        clientId,
        connectionId: generateConnectionId(),
        timestamp: new Date().toISOString(),
        data: getPipelineMetrics()
      };
      controller.enqueue(encoder.encode(`id: ${initialData.connectionId}\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(initialData)}\n\n`));

      // If client reconnected with lastEventId, send missed events
      if (lastEventId) {
        try {
          const since = parseInt(lastEventId.split('-')[0], 10) || 0;
          const missedEvents = getEvents({ since, limit: 100 });
          if (missedEvents.length > 0) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'catchup',
              events: missedEvents
            })}\n\n`));
          }
        } catch (e) {
          console.error('[SSE] Error sending catchup:', e);
        }
      }

      // Set up periodic updates
      const updateInterval = setInterval(() => {
        if (!isActive) return;

        try {
          const metrics = getPipelineMetrics();
          const update = {
            type: 'update',
            timestamp: new Date().toISOString(),
            data: metrics
          };
          const eventId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          controller.enqueue(encoder.encode(`id: ${eventId}\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(update)}\n\n`));
        } catch (err) {
          console.error('[SSE] Error sending update:', err);
          isActive = false;
        }
      }, UPDATE_INTERVAL);

      // Heartbeat to keep connection alive
      const heartbeatInterval = setInterval(() => {
        if (!isActive) return;
        try {
          controller.enqueue(encoder.encode(':heartbeat\n\n'));
        } catch (err) {
          isActive = false;
        }
      }, HEARTBEAT_INTERVAL);

      // Max duration cleanup
      const maxDurationTimeout = setTimeout(() => {
        isActive = false;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'close',
            reason: 'max_duration'
          })}\n\n`));
        } catch (e) {}
      }, MAX_STREAM_DURATION);

      // Cleanup on connection close
      request.signal.addEventListener('abort', () => {
        isActive = false;
        clearInterval(updateInterval);
        clearInterval(heartbeatInterval);
        clearTimeout(maxDurationTimeout);
        try {
          controller.close();
        } catch (e) {}
      });

      // Handle errors
      controller.signal?.addEventListener?.('abort', () => {
        isActive = false;
        clearInterval(updateInterval);
        clearInterval(heartbeatInterval);
        clearTimeout(maxDurationTimeout);
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control, Last-Event-ID',
      'X-Accel-Buffering': 'no' // Disable Nginx buffering
    }
  });
}

function generateConnectionId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}
