"use client";
import { SWRConfig } from 'swr';
import { useEffect } from 'react';

export const SWRProvider = ({ children }) => {
  // 🧪 EXPERIMENTAL DIAGNOSTIC MARK — تعديل مؤقت للتحقيق، يُحذف لاحقاً
  useEffect(() => {
    if (typeof window !== 'undefined' && window.__WIND_DIAG__) {
      window.__WIND_DIAG__.mark('SWRProvider mounted');
    }
  }, []);

  return (
    <SWRConfig 
      value={{
        revalidateOnFocus: false, // يمنع سحب الداتا لما الزائر يروح لتاب تاني ويرجع
        dedupingInterval: 300000, // يمنع تكرار نفس الطلب في خلال 5 دقائق
        shouldRetryOnError: false, // يمنع اللوب لو حصل إيرور
        keepPreviousData: true, // يخلي الموقع سريع وميعملش Loading عمال على بطال
      }}
    >
      {children}
    </SWRConfig>
  );
};