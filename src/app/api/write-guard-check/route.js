import { kvGet } from '@/lib/kv-cache';

/**
 * API route to check if a write operation is in progress (cross-tab)
 */
export async function POST(request) {
  try {
    const { key } = await request.json();
    
    if (!key) {
      return Response.json({ error: 'key is required' }, { status: 400 });
    }
    
    const kvKey = `write_guard_${key}`;
    const data = await kvGet(kvKey);
    
    if (data && data.inProgress) {
      // Check if expired
      if (data.expiresAt && data.expiresAt < Date.now()) {
        await kvSet(kvKey, null);
        return Response.json({ inProgress: false });
      }
      return Response.json({ inProgress: true });
    }
    
    return Response.json({ inProgress: false });
  } catch (error) {
    console.error('[WriteGuard Check] Error:', error);
    return Response.json({ error: 'Failed to check write guard' }, { status: 500 });
  }
}
