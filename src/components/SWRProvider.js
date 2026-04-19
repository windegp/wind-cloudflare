"use client";
import { SWRConfig } from 'swr';

export const SWRProvider = ({ children }) => {
  return (
    <SWRConfig 
      value={{
        revalidateOnFocus: false, // يمنع سحب الداتا لما الزائر يروح لتاب تاني ويرجع
        dedupingInterval: 60000, // يمنع تكرار نفس الطلب في خلال دقيقة
        shouldRetryOnError: false, // يمنع اللوب لو حصل إيرور
        keepPreviousData: true, // يخلي الموقع سريع وميعملش Loading عمال على بطال
      }}
    >
      {children}
    </SWRConfig>
  );
};