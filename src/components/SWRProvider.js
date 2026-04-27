"use client";
import { SWRConfig } from 'swr';

export const SWRProvider = ({ children }) => {
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