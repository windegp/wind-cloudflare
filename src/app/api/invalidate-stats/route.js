// invalidate-stats/route.js
import { kvDelete } from '@/lib/kv-cache';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const body = await request.json();
  if (body.secret !== process.env.REVALIDATE_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { handle } = body;
  if (!handle) return Response.json({ error: 'handle required' }, { status: 400 });
  await kvDelete(`product_stats_${handle}`);
  return Response.json({ invalidated: true });
}