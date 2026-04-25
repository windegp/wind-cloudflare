"use client";

import React, { useState, useEffect } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { usePageReady, useGlobalLoader } from "@/context/GlobalLoaderContext";
import { getDb } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore/lite";
// 🔥 حماية الكوتا
import { kvGet, kvSet, kvDelete, TTL } from '@/lib/kv-cache';
import { logRead } from '@/lib/firestoreQuota';

const POLICIES_CACHE_PREFIX = 'storefront_policy';
const CACHE_VERSION = 'v2'; // For TTL support

export default function DynamicPolicyPage() {
  const { slug } = useParams();
  const pathname = usePathname();
  const { signalPageReady } = usePageReady();
  const { isVisible: loaderActive } = useGlobalLoader();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPolicy = async () => {
      try {
        const cacheKey = `${POLICIES_CACHE_PREFIX}_${slug}_${CACHE_VERSION}`;
        
        // 🚀 محاولة KV cache أولاً
        const cached = await kvGet(cacheKey);
        if (cached) {
          setData(cached);
          logRead('fetchPolicy', 'Policies', 1, 'cache');
          setLoading(false);
          return;
        }
        
        const docRef = doc(getDb(), "Policies", slug);
        const docSnap = await getDoc(docRef);
        logRead('fetchPolicy', 'Policies', 1, 'firestore');
        
        if (docSnap.exists()) {
          const policyData = docSnap.data();
          setData(policyData);
          // 💾 تخزين في KV مع TTL 5 دقائق
          await kvSet(cacheKey, policyData, TTL.STOREFRONT_LONG);
        }
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    if (slug) fetchPolicy();
  }, [slug]);

  // Update document title safely when data loads
  useEffect(() => {
    if (data && data.title) {
      document.title = `${data.title} | WIND Shopping`;
    }
  }, [data]);

  // Signal readiness when policy data loads (FIX: add pathname to ensure re-trigger on navigation)
  useEffect(() => {
    if (!loading && data) {
      signalPageReady();
    }
  }, [loading, data, pathname, signalPageReady]);

  if (loading) return null; // Silent loading - GlobalLoader handles visual feedback

  return (
    <div className="policy-wrapper" dir="rtl">
      <style jsx>{`
        /* شلنا الفراغات اللي كانت بتخنق التصميم من برة */
        .policy-wrapper {
          background: #000;
          min-height: 100vh;
          color: #fff;
          padding: 0; /* تم إزالة الـ padding الكبير */
          font-family: 'Cairo', sans-serif;
          overflow-x: hidden;
        }
        .html-content {
          width: 100%;
        }
      `}</style>

      {/* المحتوى الجاي من الأدمن هيتعرض هنا مباشرة بملء الشاشة */}
      <main 
        className="html-content"
        dangerouslySetInnerHTML={{ __html: data?.htmlContent || "<p className='text-center mt-10'>لا يوجد محتوى متاح حالياً.</p>" }} 
      />
    </div>
  );
}