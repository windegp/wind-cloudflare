import { getDb } from "../../../lib/firebase"; 
import { getFirebaseEdge, getEdgeDb } from "../../../lib/firebase-edge";
import { collection, query, where, getDocs, limit } from "firebase/firestore/lite";
import CategoryView from "./CategoryView";
import { kvGet, kvSet } from "../../../lib/kv-cache"; // 🔥 KV Cache

// Use edge-compatible Firebase when running on edge runtime
const isEdgeRuntime = typeof window === 'undefined' && process.env.NEXT_RUNTIME === 'edge';
const firestoreDb = isEdgeRuntime ? getEdgeDb() : getDb(); 

// Helper function to serialize Firebase data (convert Timestamps to ISO strings)
function serializeData(obj) {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj.toISOString();
  if (typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => serializeData(item));
  }
  
  const serialized = {};
  for (const key in obj) {
    if (obj[key] && typeof obj[key].toDate === 'function') {
      serialized[key] = obj[key].toDate().toISOString();
    } else {
      serialized[key] = serializeData(obj[key]);
    }
  }
  return serialized;
} 

// دالة جلب بيانات القسم من السيرفر للـ SEO
async function getCategoryData(slug) {
  // 1. حاول تجيب من KV Cache
  const cacheKey = `collection_${slug}`;
  const cached = await kvGet(cacheKey);
  if (cached) return cached;

  // 2. اجيب من Firebase (مرة واحدة بس لحد ما يحصل تحديث)
  try {
    let catQuery = query(
      collection(firestoreDb, "collections"),
      where("slug", "==", slug),
      limit(1)
    );
    let catSnapshot = await getDocs(catQuery);

    if (catSnapshot.empty) {
      catQuery = query(
        collection(firestoreDb, "collections"),
        where("slug", "==", `/${slug}`),
        limit(1)
      );
      catSnapshot = await getDocs(catQuery);
    }
    
    if (!catSnapshot.empty) {
      const data = catSnapshot.docs[0].data();
      const category = serializeData({ id: catSnapshot.docs[0].id, ...data });

      // 3. خزّن في KV للأبد
      await kvSet(cacheKey, category);

      return category;
    }
  } catch (error) {
    console.error("Error fetching category data:", error);
  }
  return null;
}

// 1. توليد الـ Metadata لمحركات البحث
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const category = await getCategoryData(slug);

  const formatSlugToName = (s) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ');
  const fallbackTitle = slug === 'isdal' ? 'الإسدالات' : slug === 'shawls' ? 'الشيلان' : formatSlugToName(slug);

  const title = category?.seoTitle || category?.name || fallbackTitle;
  const description = category?.seoDescription || category?.description || `تسوق أحدث تشكيلة من ${title} في WIND. جودة وتصاميم عصرية.`;

  return {
    title: `${title} | WIND`,
    description: description,
    openGraph: {
      title: `${title} | WIND`,
      description: description,
      url: `https://windeg.com/collections/${slug}`,
      siteName: 'WIND',
      images: [{ url: category?.image || "" }],
      type: 'website',
    },
  };
}

// 2. مكون السيرفر الرئيسي
export default async function CategoryPageServer({ params }) {
  const { slug } = await params;
  
  const categoryData = await getCategoryData(slug);
  
  const formatSlugToName = (s) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ');
  const fallbackTitle = slug === 'isdal' ? 'الإسدالات' : slug === 'shawls' ? 'الشيلان' : formatSlugToName(slug);
  
  const finalCategoryData = serializeData(categoryData || { 
    name: fallbackTitle, 
    subtitle: "WIND ESSENTIALS", 
    description: "تشكيلة حصرية من WIND تناسب ذوقك." 
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": finalCategoryData.name,
    "description": finalCategoryData.seoDescription || finalCategoryData.description || "",
    "url": `https://windeg.com/collections/${slug}`,
    "image": finalCategoryData.image || ""
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <CategoryView initialSlug={slug} initialCategoryData={finalCategoryData} />
    </>
  );
}