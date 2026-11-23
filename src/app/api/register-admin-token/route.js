import { NextResponse } from 'next/server';
import { firestoreAdminSet } from '@/lib/firestoreAdmin';
import { getCairoTimestamp } from '@/lib/analytics-helpers';
import { ADMIN_UID } from '@/lib/constants';
import { verifyAdminIdToken } from '@/lib/verifyAdminIdToken';

// Native clients must send the signed-in admin's Firebase ID token as a Bearer
// token. The FCM device token in the JSON body is not proof of admin identity.
// Web registration still writes through the authenticated Firestore client.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req) {
  try {
    // Verify before parsing or writing. A caller-supplied UID, platform or Origin
    // cannot replace Firebase authentication. Fail closed if verification fails.
    const auth = await verifyAdminIdToken(req);
    if (!auth.ok) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON' },
        { status: 400, headers: CORS_HEADERS }
      );
    }
    const { token, platform } = body || {};

    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid token' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    await firestoreAdminSet('adminTokens', token, {
      token,
      uid: ADMIN_UID,
      platform: platform || 'unknown',
      createdAt: getCairoTimestamp(),
      lastSeenAt: getCairoTimestamp(),
    });

    // Do not log device tokens or Firebase ID tokens.
    console.log('Native admin token registered');

    return NextResponse.json({ success: true }, { status: 200, headers: CORS_HEADERS });
  } catch (error) {
    console.error('register-admin-token failed:', error?.name || 'Error');
    return NextResponse.json(
      { success: false, error: 'Internal Server Error' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
