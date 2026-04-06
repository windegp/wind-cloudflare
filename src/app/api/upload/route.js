import { NextResponse } from 'next/server';
import { successResponse, errorResponse } from '@/lib/apiResponse';
import { IMAGE_UPLOAD_CONFIG } from '@/lib/constants';

// Important: Force dynamic behavior to prevent Vercel caching
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Server securely reads keys from environment variables
    const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
    const publicKey = process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY;
    const urlEndpoint = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT;

    if (!privateKey || !publicKey) {
      const response = errorResponse(
        "Missing ImageKit configuration in environment variables",
        'MISSING_CONFIG',
        500
      );
      return NextResponse.json(response.body, { status: response.status });
    }

    // Generate ImageKit authentication token using Web Crypto API
    const tokenArray = new Uint8Array(20);
    crypto.getRandomValues(tokenArray);
    const token = Array.from(tokenArray)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    const expire = Math.floor(Date.now() / 1000) + IMAGE_UPLOAD_CONFIG.TOKEN_EXPIRY_SECONDS;
    
    // Create HMAC signature using Web Crypto API
    const keyBuffer = new TextEncoder().encode(privateKey);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );
    
    const dataBuffer = new TextEncoder().encode(token + expire.toString());
    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, dataBuffer);
    
    const signature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Return public key and endpoint to frontend for image upload
    const response = successResponse({
      token,
      expire,
      signature,
      publicKey,
      urlEndpoint
    }, null, 200);
    
    return NextResponse.json(response.body, { status: response.status });

  } catch (error) {
    console.error("❌ ImageKit API Error:", error);
    const response = errorResponse(error.message, 'IMAGEKIT_ERROR', 500);
    return NextResponse.json(response.body, { status: response.status });
  }
}