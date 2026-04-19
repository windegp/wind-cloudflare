import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/apiResponse'; // شيلنا successResponse من هنا
import ImageKit from "imagekit";

// Important: Force dynamic behavior to prevent Vercel/Cloudflare caching
export const dynamic = 'force-dynamic';

// Initialize ImageKit SDK with environment variables
const imagekit = new ImageKit({
  publicKey: process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT,
});

export async function GET() {
  try {
    // Validate environment variables
    if (!process.env.IMAGEKIT_PRIVATE_KEY || !process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY) {
      const response = errorResponse(
        "Missing ImageKit configuration in environment variables",
        'MISSING_CONFIG',
        500
      );
      return NextResponse.json(response.body, { status: response.status });
    }

    // Generate authentication parameters using official ImageKit SDK
    const authParams = imagekit.getAuthenticationParameters();
    
    // 🔥 الحل هنا: إرجاع البيانات "مباشرة" بدون تغليف عشان ImageUploader يقراها صح
    return NextResponse.json(authParams, { status: 200 });

  } catch (error) {
    console.error("❌ ImageKit SDK Error:", error);
    const response = errorResponse(error.message, 'IMAGEKIT_ERROR', 500);
    return NextResponse.json(response.body, { status: response.status });
  }
}