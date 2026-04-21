import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ granted: true });
  response.cookies.set('wind_site_access', 'granted', {
    path: '/',
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30 // 30 يوم
  });
  return response;
}