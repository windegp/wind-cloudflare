import { getDb } from "@/lib/firebase"; 
import { collection, getDocs, query, limit } from "firebase/firestore/lite";
import { products as staticProducts } from "@/lib/products";

// 🔥 الدرع الواقي: Cloudflare CDN هيحفظ الخريطة لمدة 24 ساعة (86400 ثانية)
// شيلنا سطر الـ edge عشان بيعمل تعارض مع مكتبة فايربيز أثناء الـ Build
export const revalidate = 86400;

export default async function sitemap() {
  const baseUrl = "https://www.windeg.com";
  const db = getDb();

  // 1. جلب المنتجات من Firebase (🛡️ مع حماية الكوتا بحد أقصى 1000 منتج)
  let fbProducts = [];
  try {
    const q = query(collection(db, "products"), limit(1000));
    const querySnapshot = await getDocs(q);
    fbProducts = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
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