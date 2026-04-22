import { kvDelete } from '@/lib/kv-cache';
export const dynamic = 'force-dynamic';

export async function POST() {
  await kvDelete('homepage_data_v1');
  return Response.json({ invalidated: true });
}