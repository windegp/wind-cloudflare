import { NextResponse } from 'next/server';

export function middleware(request) {
  try {
    const { pathname } = request.nextUrl;

    // 1. استثناءات قوية للملفات التقنية والصور
    // أضفنا فحص للامتدادات المشهورة لمنع الـ middleware من فحصها
    const isStaticFile = /\.(.*)$/.test(pathname);
    
    if (
      pathname.startsWith('/_next') ||
      pathname.startsWith('/api') ||
      pathname.startsWith('/admin') ||
      pathname.startsWith('/collections') ||
      isStaticFile
    ) {
      return NextResponse.next();
    }

    // 2. المسارات الثابتة
    const staticRoutes = ['/', '/cart', '/checkout', '/login', '/products'];
    if (staticRoutes.includes(pathname)) {
      return NextResponse.next();
    }

    // 3. التحويل (Rewrite) - الطريقة الأكثر أماناً في Edge Runtime
    const url = request.nextUrl.clone();
    url.pathname = `/collections${pathname}`;
    
    return NextResponse.rewrite(url);
  } catch (error) {
    // لو حصل أي خطأ، مرر الطلب عادي عشان الموقع ميفصلش
    console.error("Middleware Error caught:", error.message);
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    /*
     * منع الـ Middleware من العمل على أي ملف فيه نقطة (صورة، أيقونة، إلخ)
     * ومنع العمل على الـ API تماماً
     */
    '/((?!api|_next/static|_next/image|favicon.ico|favicon.png|logo.png|.*\\..*).*)',
  ],
};