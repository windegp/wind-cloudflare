// src/app/api/invalidate-product/route.js
import { kvDeleteMany } from '@/lib/kv-cache';
import { revalidatePath } from 'next/cache';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const body = await request.json();

  // ✅ أمان
  if (body.secret !== process.env.REVALIDATE_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, handle } = body;
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  // ✅ id للمنتج، handle للـ stats - مفتاحين مختلفين
  const keysToDelete = [
    `product_${id}`,
    'homepage_data_v1'
  ];
  if (handle) keysToDelete.push(`product_stats_${handle}`);

  await kvDeleteMany(keysToDelete);
  revalidatePath(`/products/${id}`);
  revalidatePath('/');
  return Response.json({ invalidated: true, keys: keysToDelete });
}