import { kvGet, kvSet } from '@/lib/kv-cache';

/**
 * Unified API route for write operations (idempotency + write guard)
 * Reduces overhead by merging tiny routes
 */
export async function POST(request) {
  try {
    const { operation, key, operationId, ttl, ttlMs } = await request.json();
    
    if (!operation) {
      return Response.json({ error: 'operation is required' }, { status: 400 });
    }
    
    // ═══════════════════════════════════════════════════════════
    // IDEMPOTENCY OPERATIONS
    // ═══════════════════════════════════════════════════════════
    
    if (operation === 'idempotency_check') {
      if (!operationId) {
        return Response.json({ error: 'operationId is required' }, { status: 400 });
      }
      
      const kvKey = `idempotency_${operationId}`;
      const data = await kvGet(kvKey);
      
      if (data && data.executed) {
        if (data.expiresAt && data.expiresAt < Date.now()) {
          await kvDelete(kvKey);
          return Response.json({ executed: false });
        }
        return Response.json({ executed: true });
      }
      
      return Response.json({ executed: false });
    }
    
    if (operation === 'idempotency_mark') {
      if (!operationId) {
        return Response.json({ error: 'operationId is required' }, { status: 400 });
      }
      
      const kvKey = `idempotency_${operationId}`;
      const idempotencyTtl = ttlMs || 600000; // Default 10 minutes
      const data = {
        executed: true,
        executedAt: Date.now(),
        expiresAt: Date.now() + idempotencyTtl
      };
      
      await kvSet(kvKey, data, idempotencyTtl / 1000);
      return Response.json({ success: true });
    }
    
    // ═══════════════════════════════════════════════════════════
    // WRITE GUARD OPERATIONS
    // ═══════════════════════════════════════════════════════════
    
    if (operation === 'write_guard_check') {
      if (!key) {
        return Response.json({ error: 'key is required' }, { status: 400 });
      }
      
      const kvKey = `write_guard_${key}`;
      const data = await kvGet(kvKey);
      
      if (data && data.inProgress) {
        if (data.expiresAt && data.expiresAt < Date.now()) {
          await kvDelete(kvKey);
          return Response.json({ inProgress: false });
        }
        return Response.json({ inProgress: true });
      }
      
      return Response.json({ inProgress: false });
    }
    
    if (operation === 'write_guard_acquire') {
      if (!key) {
        return Response.json({ error: 'key is required' }, { status: 400 });
      }
      
      const kvKey = `write_guard_${key}`;
      const guardTtl = ttl || 300; // Default 5 minutes
      
      // Check if already exists (atomic check-first-set)
      const existing = await kvGet(kvKey);
      if (existing && existing.inProgress) {
        if (existing.expiresAt && existing.expiresAt < Date.now()) {
          await kvDelete(kvKey);
        } else {
          return Response.json({ 
            success: false, 
            error: 'Guard already acquired',
            inProgress: true 
          }, { status: 409 });
        }
      }
      
      const data = {
        inProgress: true,
        timestamp: Date.now(),
        expiresAt: Date.now() + (guardTtl * 1000)
      };
      
      await kvSet(kvKey, data, guardTtl);
      return Response.json({ success: true });
    }
    
    if (operation === 'write_guard_release') {
      if (!key) {
        return Response.json({ error: 'key is required' }, { status: 400 });
      }
      
      const kvKey = `write_guard_${key}`;
      await kvDelete(kvKey);
      return Response.json({ success: true });
    }
    
    return Response.json({ error: 'Unknown operation' }, { status: 400 });
    
  } catch (error) {
    console.error('[WriteOps] Error:', error);
    return Response.json({ error: 'Operation failed' }, { status: 500 });
  }
}
