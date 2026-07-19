import { getDb } from "@/lib/firebase"; 
import { collection, getDocs, query, limit } from "firebase/firestore/lite";
import { products as staticProducts } from "@/lib/products";
import { kvGet, kvSet } from "@/lib/kv-cache";

export const revalidate = 86400;

const SITEMAP_KV_KEY = "sitemap_products_v1";

export default async function sitemap() {
  const baseUrl = "https://windeg.com";

  // 1. جرب KV أولاً — بيوفر 1000 Firestore reads لكل bot request
  let fbProducts = [];
  try {
    const cached = await kvGet(SITEMAP_KV_KEY);
    if (cached && Array.isArray(cached)) {
      fbProducts = cached;
    } else {
      // KV miss — اجيب من Firestore وخزّن
      const db = getDb();
      const q = query(collection(db, "products"), limit(1000));
      const querySnapshot = await getDocs(q);
      fbProducts = querySnapshot.docs.map(doc => ({
        id: doc.id,
        handle: doc.data().handle,
        updatedAt: doc.data().updatedAt || null,
        status: doc.data().status,
      }));
      // خزّن في KV — يُحذف عند /api/revalidate?type=sitemap أو product update
      await kvSet(SITEMAP_KV_KEY, fbProducts);
    }
  } catch (error) {
    console.error("Error fetching products for sitemap:", error);
  }

  // 2. دمج المنتجات
  const allProducts = [...staticProducts, ...fbProducts];

  // 3. تحويل المنتجات لروابط مع معالجة ذكية للتاريخ
  const productEntries = allProducts.map((p) => {
    const identifier = p.id || p.handle; 
    
    // --- معالجة التاريخ لضمان عدم حدوث Error ---
    let finalDate = new Date(); 

    if (p.updatedAt) {
      try {
        if (p.updatedAt.seconds) {
          finalDate = new Date(p.updatedAt.seconds * 1000);
        } else {
          const parsedDate = new Date(p.updatedAt);
          if (!isNaN(parsedDate.getTime())) {
            finalDate = parsedDate;
          }
        }
      } catch (e) {
        finalDate = new Date();
      }
    }

    return {
      url: `${baseUrl}/products/${identifier}`,
      lastModified: finalDate,
      changeFrequency: 'daily',
      priority: 0.7,
    };
  });

  // 4. إرجاع الروابط النهائية
  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    ...productEntries,
  ];
}