import { NextResponse } from 'next/server';
import { getDb } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore/lite";

export async function GET() {
  try {
    // Try to get data from KV cache first
    const kv = globalThis.__ENV__?.WIND_KV || process.env.WIND_KV;
    
    if (kv) {
      try {
        // Check if data exists in KV cache
        const cachedData = await kv.get('homepage_data_v1');
        
        if (cachedData) {
          console.log('KV Cache HIT: Serving homepage data from cache');
          return NextResponse.json({
            success: true,
            source: 'cache',
            data: JSON.parse(cachedData)
          });
        }
        
        console.log('KV Cache MISS: Data not found, fetching from Firebase');
      } catch (kvError) {
        console.error('KV Error:', kvError);
        // Continue to Firebase fallback
      }
    } else {
      console.log('KV not available in development, using Firebase directly');
    }

    // Firebase fallback - fetch data from Firebase
    const db = getDb();
    
    // Fetch layout config
    const layoutRef = doc(db, "homepage", "layout_config");
    const layoutSnap = await getDoc(layoutRef);
    const layoutData = layoutSnap.exists() ? layoutSnap.data() : { sections: [] };
    
    // Fetch hero data
    const heroRef = doc(db, "homepage", "main-hero");
    const heroSnap = await getDoc(heroRef);
    const heroData = heroSnap.exists() ? heroSnap.data() : { slides: [], categories: [] };
    
    const firebaseData = {
      layout: layoutData,
      hero: heroData
    };

    // Store in KV cache for future requests (if KV is available)
    if (kv) {
      try {
        await kv.put('homepage_data_v1', JSON.stringify(firebaseData));
        console.log('KV Cache: Stored homepage data successfully');
      } catch (storeError) {
        console.error('KV Store Error:', storeError);
        // Continue - data is still served to user
      }
    }

    return NextResponse.json({
      success: true,
      source: 'firebase',
      data: firebaseData
    });

  } catch (error) {
    console.error('Homepage API Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch homepage data',
        source: 'error'
      },
      { status: 500 }
    );
  }
}
