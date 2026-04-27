import { kvDelete } from '@/lib/kv-cache';

/**
 * API route to release write guard (cross-tab)
 */
export async function POST(request) {
  try {
    const { key } = await request.json();
    
    if (!key) {
      return Response.json({ error: 'key is required' }, { status: 400 });
    }
    
    const kvKey = `write_guard_${key}`;
    await kvDelete(kvKey);
    
    return Response.json({ success: true });
  } catch (error) {
    console.error('[WriteGuard Release] Error:', error);
    return Response.json({ error: 'Failed to release write guard' }, { status: 500 });
  }
}
