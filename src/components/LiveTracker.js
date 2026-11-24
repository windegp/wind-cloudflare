"use client";

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useCart } from '../context/CartContext';
import { getRtdb } from '@/lib/firebase';
import { ref, set, onDisconnect, serverTimestamp, remove, onValue } from 'firebase/database';

// The admin live board hides sessions older than 90 s (src/app/admin/live/page.js),
// so the heartbeat must stay well under that. 30 s keeps three beats of margin.
const HEARTBEAT_MS = 30000;

/**
 * Live visitor presence.
 *
 * One connection watcher and one onDisconnect registration per session (standard Firebase
 * presence pattern), instead of remove + onDisconnect + set on every navigation or cart change.
 * Navigation and cart changes only send one `set` with the new path/status.
 * The visitor is removed by the server (onDisconnect) when the connection drops, and by this
 * component when the visitor moves into /admin.
 */
export default function LiveTracker() {
  const pathname = usePathname();
  const { cartItems, subtotal } = useCart();
  const isAdminPath = !!pathname?.startsWith('/admin');

  // Latest values, read by the sender without re-creating the connection.
  const stateRef = useRef({ pathname, itemsCount: 0, subtotal: 0 });
  const sendRef = useRef(null);

  stateRef.current = {
    pathname: pathname || '/',
    itemsCount: cartItems?.length || 0,
    subtotal: subtotal || 0,
  };

  // Connection, onDisconnect and heartbeat: set up once, and again only when entering/leaving /admin.
  useEffect(() => {
    if (isAdminPath) return; // admin is never tracked

    let sessionId = sessionStorage.getItem('wind_live_session');
    if (!sessionId) {
      sessionId = 'sess_' + Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem('wind_live_session', sessionId);
    }

    let sessionRef;
    let unsubscribeConnected = () => {};
    let heartbeat = null;
    let connected = false;
    let pending = false;

    const send = () => {
      if (!connected || !sessionRef) return;
      // Hidden tab: skip, and send immediately when it becomes visible again.
      if (document.hidden) { pending = true; return; }
      pending = false;

      const { pathname: path, itemsCount, subtotal: cartValue } = stateRef.current;
      let status = 'browsing';
      if (path.includes('/thank-you')) status = 'purchased';
      else if (path.includes('/checkout')) status = 'checkout';
      else if (itemsCount > 0) status = 'active_cart';

      set(sessionRef, {
        path,
        cartValue,
        itemsCount,
        status,
        lastActive: serverTimestamp(),
        lastActiveClient: Date.now(),
        device: window.innerWidth < 768 ? 'Mobile' : 'Desktop',
      }).catch(() => {
        // Silent fail on quota/network issues
      });
    };
    sendRef.current = send;

    const onVisibility = () => {
      if (!document.hidden && pending) send();
    };

    try {
      const rtdb = getRtdb();
      sessionRef = ref(rtdb, `LiveSessions/${sessionId}`);

      // Runs on every (re)connect: register the server-side cleanup, then publish the state.
      unsubscribeConnected = onValue(ref(rtdb, '.info/connected'), (snap) => {
        connected = snap.val() === true;
        if (!connected) return;
        onDisconnect(sessionRef).remove().catch(() => {});
        send();
      });

      heartbeat = setInterval(send, HEARTBEAT_MS);
      document.addEventListener('visibilitychange', onVisibility);
    } catch (error) {
      console.warn("LiveTracker initialization skipped (Edge Runtime Protection)");
    }

    return () => {
      sendRef.current = null;
      if (heartbeat) clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', onVisibility);
      unsubscribeConnected();
      // Leaving the tracked area (into /admin) or unmounting: clean up the node,
      // except after a purchase, which stays until the connection drops.
      if (sessionRef && !stateRef.current.pathname.includes('/thank-you')) {
        remove(sessionRef).catch(() => {});
      }
    };
  }, [isAdminPath]);

  // Navigation or cart change: one set with the new values, no remove, no re-registration.
  useEffect(() => {
    if (sendRef.current) sendRef.current();
  }, [pathname, cartItems?.length, subtotal]);

  return null;
}
