"use client";

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { usePageReady, useGlobalLoader } from '@/context/GlobalLoaderContext';

export default function FailedPage() {
    const pathname = usePathname();
    const { signalPageReady } = usePageReady();
    const { isVisible: loaderActive } = useGlobalLoader();

    // Signal readiness for GlobalLoader (failure page is ready immediately)
    useEffect(() => {
        signalPageReady();
    }, [pathname, signalPageReady]);

    return (
        <div className="text-center mt-20">
            <div className="text-red-500 text-6xl mb-4">✘</div>
            <h1 className="text-2xl font-bold mb-2">نأسف، لم تكتمل العملية</h1>
            <p className="text-gray-600 mb-8">يرجى التأكد من بيانات البطاقة أو المحاولة مرة أخرى لاحقاً.</p>
            <Link 
                href="/checkout" 
                className="bg-blue-600 text-white px-6 py-2 rounded-md"
            >
                إعادة المحاولة
            </Link>
        </div>
    );
}