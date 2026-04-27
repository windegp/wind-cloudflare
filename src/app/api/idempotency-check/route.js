import { kvGet, kvDelete } from '@/lib/kv-cache';

/**
 * API route to check if an operation has been executed (idempotency check)
 * Uses KV storage for cross-tab/reload persistence
 */
export async function POST(request) {
  try {
    const { operationId } = await request.json();
    
    if (!operationId) {
      return Response.json({ error: 'operationId is required' }, { status: 400 });
    }
    
    const kvKey = `idempotency_${operationId}`;
    const data = await kvGet(kvKey);
    
    if (data && data.executed) {
      // Check if expired
      if (data.expiresAt && data.expiresAt < Date.now()) {
        await kvDelete(kvKey); // Clear expired entry
        return Response.json({ executed: false });
      }
      return Response.json({ executed: true });
    }
    
    return Response.json({ executed: false });
  } catch (error) {
    console.error('[Idempotency Check] Error:', error);
    return Response.json({ error: 'Failed to check idempotency' }, { status: 500 });
  }
}
