import { getCloudflareContext } from '@opennextjs/cloudflare';
import { revalidatePath } from 'next/cache'; // 🔥 ضروري جداً

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const { id } = await request.json();
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  try {
    const ctx = await getCloudflareContext({ async: true });
    const kv = ctx?.env?.WIND_KV || null;
    
    if (kv) {
      await Promise.all([
        kv.delete(`product_${id}`),
        kv.delete(`product_stats_${id}`),
        kv.delete("homepage_data_v1")
      ]);
    }

    // 🔥 السطر ده هو اللي هيخلي المنتج يظهر فوراً في المسار الجديد
    revalidatePath(`/products/${id}`); 
    revalidatePath('/'); 

    return Response.json({ invalidated: true });
  } catch (error) {
    console.error("Invalidation Error:", error);
    return Response.json({ invalidated: false, message: error.message });
  }
}