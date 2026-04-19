import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const { secret, keys } = body;

    // Validate the secret
    const expectedSecret = process.env.REVALIDATE_SECRET || process.env.NEXT_PUBLIC_REVALIDATE_SECRET;
    if (!expectedSecret || secret !== expectedSecret) {
      return NextResponse.json(
        { success: false, error: 'Invalid secret' },
        { status: 401 }
      );
    }

    // Get KV namespace
    const kv = globalThis.__ENV__?.WIND_KV || process.env.WIND_KV;
    
    if (!kv) {
      console.log('KV not available in development - cache revalidate skipped');
      return NextResponse.json({
        success: true,
        message: 'KV not available in development, cache revalidate skipped',
        cleared: []
      });
    }

    const clearedKeys = [];

    // Clear specific keys if provided, otherwise clear homepage data
    const keysToClear = keys && keys.length > 0 ? keys : ['homepage_data_v1'];

    for (const key of keysToClear) {
      try {
        await kv.delete(key);
        clearedKeys.push(key);
        console.log(`KV Cache: Cleared key "${key}"`);
      } catch (error) {
        console.error(`Failed to clear KV key "${key}":`, error);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Cache invalidated for ${clearedKeys.length} key(s)`,
      cleared: clearedKeys
    });

  } catch (error) {
    console.error('Revalidate API Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to invalidate cache'
      },
      { status: 500 }
    );
  }
}
