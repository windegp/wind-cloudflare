import { kvDelete } from '@/lib/kv-cache';
export const dynamic = 'force-dynamic';

export async function POST() {
  await kvDelete('site_settings_v1');
  return Response.json({ invalidated: true });
}