/**
 * Web Crypto API Fallback for Legacy Browsers
 * 
 * Provides HMAC-SHA256 functionality using crypto-js as fallback
 * when native Web Crypto API is unavailable.
 * 
 * SAFETY: Always attempts native crypto first, falls back only when needed.
 */

import { safeGet, hasWebCrypto } from './featureDetection';

// ============================================
// 1. DYNAMIC IMPORT FOR FALLBACK LIBRARY
// ============================================

let CryptoJS = null;

async function loadCryptoJS() {
  if (CryptoJS) return CryptoJS;
  try {
    const module = await import('crypto-js');
    CryptoJS = module;
    return CryptoJS;
  } catch (e) {
    console.warn('[CryptoFallback] Failed to load crypto-js:', e);
    return null;
  }
}

// ============================================
// 2. HMAC-SHA256 IMPLEMENTATION
// ============================================

/**
 * Generate HMAC-SHA256 signature with automatic fallback
 * @param {string} message - Message to sign
 * @param {string} secret - Secret key
 * @returns {Promise<string>} - Hex-encoded signature
 */
export async function generateHmacSha256(message, secret) {
  // Try native Web Crypto first
  if (hasWebCrypto && typeof TextEncoder !== 'undefined') {
    try {
      const encoder = new TextEncoder();
      const keyData = encoder.encode(secret);
      const messageData = encoder.encode(message);
      
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      
      const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
      const hashArray = Array.from(new Uint8Array(signature));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      console.warn('[CryptoFallback] Native crypto failed, using fallback:', e);
    }
  }
  
  // Fallback to crypto-js
  const cryptoJS = await loadCryptoJS();
  if (!cryptoJS) {
    throw new Error('No crypto implementation available');
  }
  
  const hash = cryptoJS.HmacSHA256(message, secret);
  return hash.toString(cryptoJS.enc.Hex);
}

/**
 * Verify HMAC-SHA256 signature with automatic fallback
 * @param {string} message - Original message
 * @param {string} secret - Secret key
 * @param {string} signature - Hex-encoded signature to verify
 * @returns {Promise<boolean>} - Verification result
 */
export async function verifyHmacSha256(message, secret, signature) {
  try {
    const computed = await generateHmacSha256(message, secret);
    // Constant-time comparison to prevent timing attacks
    if (computed.length !== signature.length) return false;
    let result = 0;
    for (let i = 0; i < computed.length; i++) {
      result |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return result === 0;
  } catch (e) {
    console.error('[CryptoFallback] Verification failed:', e);
    return false;
  }
}

// ============================================
// 3. TEXT ENCODER SAFETY
// ============================================

export function ensureTextEncoder() {
  if (typeof TextEncoder === 'undefined') {
    // Polyfill should already be loaded from polyfills.js
    console.warn('[CryptoFallback] TextEncoder not available');
  }
}

export default {
  generateHmacSha256,
  verifyHmacSha256,
  hasWebCrypto,
};
