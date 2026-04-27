import { kvGet, kvSet } from '@/lib/kv-cache';

/**
 * API route to acquire write guard (cross-tab)
 * Uses check-first-set pattern for atomicity - first request wins
 */
export async function POST(request) {
  try {
    const { key, ttl = 300 } = await request.json(); // Default 5 minutes
    
    if (!key) {
      return Response.json({ error: 'key is required' }, { status: 400 });
    }
    
    const kvKey = `write_guard_${key}`;
    
    // Check if already exists (atomic check-first-set)
    const existing = await kvGet(kvKey);
    if (existing && existing.inProgress) {
      // Check if expired
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
      expiresAt: Date.now() + (ttl * 1000)
    };
    
    // Store in KV with TTL
    await kvSet(kvKey, data, ttl);
    
    return Response.json({ success: true });
  } catch (error) {
    console.error('[WriteGuard Acquire] Error:', error);
    return Response.json({ error: 'Failed to acquire write guard' }, { status: 500 });
  }
}
