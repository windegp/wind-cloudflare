import { kvDeleteMany } from '@/lib/kv-cache';
import { revalidatePath } from 'next/cache';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const body = await request.json();
  const { slug } = body;
  if (!slug) return Response.json({ error: 'slug required' }, { status: 400 });

  await kvDeleteMany([`collection_${slug}`, 'homepage_data_v1']);
  revalidatePath(`/collections/${slug}`);
  revalidatePath('/');
  return Response.json({ invalidated: true });
}