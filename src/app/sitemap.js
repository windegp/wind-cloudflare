import { getDb } from "@/lib/firebase"; 
import { collection, getDocs } from "firebase/firestore/lite";
import { products as staticProducts } from "@/lib/products";

export default async function sitemap() {
  const baseUrl = "https://www.windeg.com";
  const db = getDb();

  // 1. جلب المنتجات من Firebase
  let fbProducts = [];
  try {
    const querySnapshot = await getDocs(collection(db, "products"));
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
    let finalDate = new Date(); // افتراضياً تاريخ اليوم

    if (p.updatedAt) {
      try {
        // إذا كان التاريخ جاي من Firebase Timestamp
        if (p.updatedAt.seconds) {
          finalDate = new Date(p.updatedAt.seconds * 1000);
        } else {
          // إذا كان التاريخ نصي أو Date عادي
          const parsedDate = new Date(p.updatedAt);
          if (!isNaN(parsedDate.getTime())) {
            finalDate = parsedDate;
          }
        }
      } catch (e) {
        // لو حصل أي فشل في التحويل، هيفضل تاريخ اليوم هو البديل الآمن
        finalDate = new Date();
      }
    }

    return {
      url: `${baseUrl}/product/${identifier}`,
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