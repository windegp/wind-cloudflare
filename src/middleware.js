import { NextResponse } from 'next/server';

export function middleware(request) {
  const url = request.nextUrl.clone();

  // 1. السماح لملفات النظام والـ API
  if (
    url.pathname.startsWith('/_next') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)$/)
  ) {
    return NextResponse.next();
  }

  // 2. السماح للأدمن دايماً
  if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/login')) {
    return NextResponse.next();
  }


  // 3. لو عنده cookie → يدخل
  const hasAccess = request.cookies.get('wind_site_access')?.value === 'granted';
  if (hasAccess) return NextResponse.next();

  // 5. لو مش عنده cookie → يروح الصفحة الرئيسية (اللي فيها الباسورد)
  if (url.pathname !== '/') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};