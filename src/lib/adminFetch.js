"use client";

import { getAuthInstance } from "@/lib/firebase";

/**
 * fetch() for admin-only API routes. Adds the signed-in admin's Firebase ID token
 * as a Bearer token. Without a signed-in user it sends the request unchanged,
 * and the server answers 401.
 */
export async function adminFetch(input, init = {}) {
  const headers = new Headers(init.headers || {});
  try {
    const user = getAuthInstance().currentUser;
    if (user) headers.set("Authorization", `Bearer ${await user.getIdToken()}`);
  } catch {
    // fall through without a token
  }
  return fetch(input, { ...init, headers });
}
