import { kvGet, kvSet } from '@/lib/kv-cache';

/**
 * API route to mark an operation as executed (idempotency)
 * Uses KV storage for cross-tab/reload persistence with TTL
 */
export async function POST(request) {
  try {
    const { operationId, ttlMs = 600000 } = await request.json(); // Default 10 minutes
    
    if (!operationId) {
      return Response.json({ error: 'operationId is required' }, { status: 400 });
    }
    
    const kvKey = `idempotency_${operationId}`;
    const data = {
      executed: true,
      executedAt: Date.now(),
      expiresAt: Date.now() + ttlMs
    };
    
    // Store in KV with TTL
    await kvSet(kvKey, data, ttlMs / 1000); // Convert to seconds
    
    return Response.json({ success: true });
  } catch (error) {
    console.error('[Idempotency Mark] Error:', error);
    return Response.json({ error: 'Failed to mark operation' }, { status: 500 });
  }
}
