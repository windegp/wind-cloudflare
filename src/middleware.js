import { NextResponse } from 'next/server';

export function middleware(request) {
  const url = request.nextUrl.clone();

  // 1. السماح بمرور ملفات النظام والصور وواجهات الـ API لضمان عمل الموقع والمصادقة بشكل سليم
  if (
    url.pathname.startsWith('/_next') || 
    url.pathname.startsWith('/api/') || 
    url.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)$/)
  ) {
    return NextResponse.next();
  }

  // 2. 🟢 الباب المفتوح للأدمن والمصادقة (الاستثناء الجديد) 🟢
  // السماح بمرور أي مسار يبدأ بـ /admin أو /login 
  if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/login')) {
    return NextResponse.next();
  }

  // 3. الباب السري: التحقق من الرابط الخاص بك (مفتاح الدخول للمتجر نفسه)
  if (url.searchParams.get('vip') === 'wind2026') {
    // بمجرد استخدام الرابط، نقوم بتوجيهك للرئيسية وإعطائك تصريح (كوكيز) الدخول
    const response = NextResponse.redirect(new URL('/', request.url));
    response.cookies.set('wind_admin_access', 'granted', { path: '/', httpOnly: true });
    return response;
  }

  // 4. التحقق مما إذا كان المتصفح الحالي يمتلك تصريح الدخول (للمتجر كزائر VIP)
  const hasAccess = request.cookies.get('wind_admin_access')?.value === 'granted';

  // 5. السماح بالمرور وعرض الموقع بالكامل (إذا كان يمتلك التصريح)
  return NextResponse.next();
}

// تحديد المسارات التي يراقبها الميدل وير
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};