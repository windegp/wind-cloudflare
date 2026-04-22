import { kvDeleteMany } from '@/lib/kv-cache';
import { revalidatePath } from 'next/cache';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const body = await request.json();

  if (!body.id) return Response.json({ error: 'id required' }, { status: 400 });

  const { id, handle } = body;
  const keysToDelete = [`product_${id}`, 'homepage_data_v1'];
  if (handle) keysToDelete.push(`product_stats_${handle}`);

  await kvDeleteMany(keysToDelete);
  revalidatePath(`/products/${id}`);
  revalidatePath('/');
  return Response.json({ invalidated: true, keys: keysToDelete });
}