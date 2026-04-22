// invalidate-homepage/route.js
import { kvDelete } from '@/lib/kv-cache';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const body = await request.json();
  if (body.secret !== process.env.REVALIDATE_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await kvDelete('homepage_data_v1');
  return Response.json({ invalidated: true });
}