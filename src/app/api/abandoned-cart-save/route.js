import { getDb } from '@/lib/firebase';
import { doc, setDoc } from 'firebase/firestore/lite';

/**
 * API route to save abandoned cart data during page unload
 * Uses POST method to work with navigator.sendBeacon
 */
export async function POST(request) {
  try {
    const { action, data } = await request.json();
    
    if (action !== 'save_abandoned_cart' || !data) {
      return Response.json({ error: 'Invalid request' }, { status: 400 });
    }
    
    const db = getDb();
    const orderRef = doc(db, 'Orders', data.Name);
    
    await setDoc(orderRef, data, { merge: true });
    
    return Response.json({ success: true });
  } catch (error) {
    console.error('[AbandonedCart Save] Error:', error);
    return Response.json({ error: 'Failed to save abandoned cart' }, { status: 500 });
  }
}
