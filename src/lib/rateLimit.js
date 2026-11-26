/**
 * API Rate Limiting Utility
 * 
 * Provides basic per-IP rate limiting to prevent API abuse.
 * Uses Cloudflare KV for distributed rate limiting.
 */

import { getKV } from './kv-cache';

// ═══════════════════════════════════════════════════════════
// RATE LIMIT CONFIGURATION
// ═══════════════════════════════════════════════════════════

const RATE_LIMITS = {
  // Standard API endpoints
  DEFAULT: {
    requests: 60,     // 60 requests
    window: 60,       // per 60 seconds (1 minute)
    blockDuration: 300 // Block for 5 minutes if exceeded
  },
  
  // Stricter limits for expensive operations
  EXPORT: {
    requests: 10,     // 10 exports
    window: 300,      // per 5 minutes
    blockDuration: 600 // Block for 10 minutes
  },
  
  // Very strict for authentication endpoints
  AUTH: {
    requests: 5,      // 5 attempts
    window: 300,      // per 5 minutes
    blockDuration: 900 // Block for 15 minutes
  },

  // Public customer image uploads
  REVIEW_UPLOAD: {
    requests: 12,
    window: 60,
    blockDuration: 300
  },
  
  // Public cache refresh after a like or review
  REVALIDATE_PUBLIC: {
    requests: 30,
    window: 60,
    blockDuration: 300
  },

  // Pixel / Conversions API relays (a page view plus a few events per visit).
  // Meta and TikTok use separate counters so one pixel never uses up the other's allowance.
  // Same limit as before, now per relay. TRACKING is kept for any caller that still uses it.
  TRACKING: {
    requests: 90,
    window: 60,
    blockDuration: 300
  },
  TRACKING_FB: {
    requests: 90,
    window: 60,
    blockDuration: 300
  },
  TRACKING_TT: {
    requests: 90,
    window: 60,
    blockDuration: 300
  },

  // Order creation / confirmation emails
  CREATE_ORDER: {
    requests: 60,
    window: 300,
    blockDuration: 600
  },

  // Public order tracking lookups (order number + phone guessing protection)
  TRACK_ORDER: {
    requests: 8,
    window: 300,
    blockDuration: 900
  },

  // Abandoned-cart recovery links (secret-token lookups and snapshot saves)
  CART_RECOVERY: {
    requests: 10,
    window: 300,
    blockDuration: 900
  },

  // Public contact form (sends an email to the store owner)
  CONTACT: {
    requests: 5,
    window: 600,
    blockDuration: 1800
  },

  // Relaxed for read-only endpoints
  READ: {
    requests: 100,    // 100 requests
    window: 60,       // per minute
    blockDuration: 300
  }
};

// ═══════════════════════════════════════════════════════════
// RATE LIMITING FUNCTIONS
// ═══════════════════════════════════════════════════════════

/**
 * Gets the client's IP address from request headers
 * Works with Cloudflare and standard headers
 */
export function getClientIP(request) {
  // Cloudflare provides the real client IP
  const cfIP = request.headers.get('cf-connecting-ip');
  if (cfIP) return cfIP;
  
  // Fallback to standard headers
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // Get the first IP in the chain (original client)
    return forwarded.split(',')[0].trim();
  }
  
  const realIP = request.headers.get('x-real-ip');
  if (realIP) return realIP;
  
  // Last resort - return unknown (should not happen with Cloudflare)
  return 'unknown';
}

/**
 * Generates rate limit key for an IP
 */
function getRateLimitKey(ip, endpointType = 'DEFAULT') {
  return `ratelimit_${endpointType}_${ip}`;
}

// Endpoints that protect against guessing, spam or abuse. If KV errors out (for example the
// daily write quota is used up) these keep a per-isolate counter instead of switching protection
// off. Tracking relays are NOT listed: they stay open so no conversion event is ever dropped.
const MEMORY_FALLBACK_TYPES = new Set(['TRACK_ORDER', 'CONTACT', 'CREATE_ORDER', 'CART_RECOVERY']);
const memoryCounters = new Map();
const MEMORY_MAX_ENTRIES = 5000;

function memoryCheck(ip, endpointType, config) {
  const now = Math.floor(Date.now() / 1000);
  const key = getRateLimitKey(ip, endpointType);

  if (memoryCounters.size > MEMORY_MAX_ENTRIES) {
    for (const [k, v] of memoryCounters) {
      if (now > Math.max(v.resetTime, v.blockUntil || 0)) memoryCounters.delete(k);
    }
    if (memoryCounters.size > MEMORY_MAX_ENTRIES) memoryCounters.clear();
  }

  let entry = memoryCounters.get(key);
  if (entry?.blockUntil && now < entry.blockUntil) {
    return { allowed: false, remaining: 0, resetTime: entry.blockUntil, blocked: true };
  }
  if (!entry || now > entry.resetTime) {
    entry = { count: 1, resetTime: now + config.window };
  } else {
    entry.count += 1;
  }
  if (entry.count > config.requests) {
    entry.blockUntil = now + config.blockDuration;
    memoryCounters.set(key, entry);
    return { allowed: false, remaining: 0, resetTime: entry.blockUntil, blocked: true };
  }
  memoryCounters.set(key, entry);
  return { allowed: true, remaining: Math.max(0, config.requests - entry.count), resetTime: entry.resetTime, blocked: false };
}

function failedKvResult(ip, endpointType) {
  if (MEMORY_FALLBACK_TYPES.has(endpointType)) {
    return memoryCheck(ip, endpointType, RATE_LIMITS[endpointType] || RATE_LIMITS.DEFAULT);
  }
  // Fail open for everything else
  return { allowed: true, remaining: 1, resetTime: 0, blocked: false };
}

/**
 * Checks if a request should be rate limited
 * 
 * @param {string} ip - Client IP address
 * @param {string} endpointType - Type of endpoint (DEFAULT, EXPORT, AUTH, READ)
 * @returns {Promise<{allowed: boolean, remaining: number, resetTime: number, blocked: boolean}>}
 */
export async function checkRateLimit(ip, endpointType = 'DEFAULT') {
  try {
    const kv = await getKV();
    if (!kv) {
      // KV binding not available: sensitive endpoints use the in-memory counter, others allow
      return failedKvResult(ip, endpointType);
    }
    
    const config = RATE_LIMITS[endpointType] || RATE_LIMITS.DEFAULT;
    const key = getRateLimitKey(ip, endpointType);
    const blockKey = `${key}_blocked`;
    
    // Check if IP is currently blocked
    const blocked = await kv.get(blockKey);
    if (blocked) {
      const blockData = JSON.parse(blocked);
      const now = Math.floor(Date.now() / 1000);
      
      if (now < blockData.until) {
        // Still blocked
        return {
          allowed: false,
          remaining: 0,
          resetTime: blockData.until,
          blocked: true
        };
      }
      // Block expired, delete it
      await kv.delete(blockKey);
    }
    
    // Get current request count
    const current = await kv.get(key);
    const now = Math.floor(Date.now() / 1000);
    
    let requestData;
    if (current) {
      requestData = JSON.parse(current);
      
      // Check if window has expired
      if (now > requestData.resetTime) {
        // Reset window
        requestData = {
          count: 1,
          resetTime: now + config.window
        };
      } else {
        // Increment count
        requestData.count += 1;
      }
    } else {
      // New window
      requestData = {
        count: 1,
        resetTime: now + config.window
      };
    }
    
    // Store updated count
    await kv.put(key, JSON.stringify(requestData), { expirationTtl: config.window });
    
    // Check if limit exceeded
    if (requestData.count > config.requests) {
      // Block the IP
      const blockUntil = now + config.blockDuration;
      await kv.put(blockKey, JSON.stringify({ until: blockUntil }), { expirationTtl: config.blockDuration });
      
      console.warn(`[RATE LIMIT] IP ${ip} blocked for ${endpointType} until ${new Date(blockUntil * 1000).toISOString()}`);
      
      return {
        allowed: false,
        remaining: 0,
        resetTime: blockUntil,
        blocked: true
      };
    }
    
    // Request allowed
    return {
      allowed: true,
      remaining: Math.max(0, config.requests - requestData.count),
      resetTime: requestData.resetTime,
      blocked: false
    };
    
  } catch (err) {
    console.error('[RATE LIMIT] Error checking rate limit:', err);
    // KV error: sensitive endpoints keep an in-memory counter, everything else fails open
    return failedKvResult(ip, endpointType);
  }
}

/**
 * Creates a rate limit response for blocked requests
 */
export function createRateLimitResponse(resetTime) {
  const retryAfter = Math.max(0, resetTime - Math.floor(Date.now() / 1000));
  
  return new Response(
    JSON.stringify({
      error: 'Rate limit exceeded',
      message: `Too many requests. Please try again in ${retryAfter} seconds.`,
      retryAfter
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
        'X-RateLimit-Reset': String(resetTime)
      }
    }
  );
}

/**
 * Higher-order function to wrap API handlers with rate limiting
 */
export function withRateLimit(handler, endpointType = 'DEFAULT') {
  return async (request, ...args) => {
    const ip = getClientIP(request);
    const rateLimit = await checkRateLimit(ip, endpointType);
    
    if (!rateLimit.allowed) {
      return createRateLimitResponse(rateLimit.resetTime);
    }
    
    // Add rate limit headers to response
    const response = await handler(request, ...args);
    
    // Clone response to add headers
    const newHeaders = new Headers(response.headers);
    newHeaders.set('X-RateLimit-Remaining', String(rateLimit.remaining));
    newHeaders.set('X-RateLimit-Reset', String(rateLimit.resetTime));
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  };
}

/**
 * Manually resets rate limit for an IP (useful for admin override)
 */
export async function resetRateLimit(ip, endpointType = 'DEFAULT') {
  try {
    const kv = await getKV();
    if (!kv) return false;
    
    const key = getRateLimitKey(ip, endpointType);
    const blockKey = `${key}_blocked`;
    
    await Promise.all([
      kv.delete(key),
      kv.delete(blockKey)
    ]);
    
    return true;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
// USAGE EXAMPLES
// ═══════════════════════════════════════════════════════════

/*
// In an API route:
import { withRateLimit, getClientIP, checkRateLimit } from '@/lib/rateLimit';

// Option 1: Wrap the entire handler
export const GET = withRateLimit(async (request) => {
  // Your handler logic
  return new Response(JSON.stringify(data));
}, 'READ');

// Option 2: Manual check for more control
export async function POST(request) {
  const ip = getClientIP(request);
  const rateLimit = await checkRateLimit(ip, 'EXPORT');
  
  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit.resetTime);
  }
  
  // Continue with export...
}
*/
