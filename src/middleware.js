import { NextResponse } from 'next/server';

export function middleware(request) {
  const url = request.nextUrl.clone();
  const { pathname } = url;

  // 1. استثناء ملفات النظام والـ API والـ Static Files (تحسين الأداء)
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') ||
    pathname.includes('.') || // بيغطي كل الصور والملفات اللي فيها نقطة
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // 2. السماح للأدمن واللوجن دايماً
  if (pathname.startsWith('/admin') || pathname.startsWith('/login')) {
    return NextResponse.next();
  }

  // 3. فحص الوصول (Cookie Check) - Safe property access for legacy browser compatibility
  const accessCookie = request.cookies.get('wind_site_access');
  const hasAccess = accessCookie && accessCookie.value === 'granted';

  // 4. إذا كان لديه صلاحية، يسمح له بالمرور
  if (hasAccess) {
    return NextResponse.next();
  }

  // 5. حماية الصفحات: لو مش معاك كوكيز ومش واقف على الصفحة الرئيسية
  // بنحوله للرئيسية عشان يكتب الباسورد
  if (!hasAccess && pathname !== '/') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // بيطبق الميدل وير على كل المسارات ما عدا المذكور في الاستثناءات فوق
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};