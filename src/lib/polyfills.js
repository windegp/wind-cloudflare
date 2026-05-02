/**
 * Compatibility Polyfills Layer
 * Non-breaking polyfills for legacy browser support
 */

// Object.fromEntries polyfill (Chrome < 73)
if (!Object.fromEntries) {
  Object.fromEntries = function(iterable) {
    const obj = {};
    for (const [key, value] of iterable) {
      obj[key] = value;
    }
    return obj;
  };
}

// Array.flat polyfill (Chrome < 69)
if (!Array.prototype.flat) {
  Array.prototype.flat = function(depth) {
    depth = depth === undefined ? 1 : Math.floor(depth);
    if (depth < 1) return this.slice();
    return this.reduce(function(acc, val) {
      return acc.concat(Array.isArray(val) ? val.flat(depth - 1) : val);
    }, []);
  };
}

// Array.flatMap polyfill (Chrome < 69)
if (!Array.prototype.flatMap) {
  Array.prototype.flatMap = function(callback, thisArg) {
    return this.map(callback, thisArg).flat(1);
  };
}

// Number.isFinite polyfill (Chrome < 47, IE)
if (!Number.isFinite) {
  Number.isFinite = function(value) {
    return typeof value === 'number' && isFinite(value);
  };
}

// Minimal TextEncoder polyfill
if (typeof TextEncoder === 'undefined') {
  globalThis.TextEncoder = class TextEncoder {
    encode(str) {
      const utf8 = [];
      for (let i = 0; i < str.length; i++) {
        let charcode = str.charCodeAt(i);
        if (charcode < 0x80) utf8.push(charcode);
        else if (charcode < 0x800) {
          utf8.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f));
        } else {
          utf8.push(
            0xe0 | (charcode >> 12),
            0x80 | ((charcode >> 6) & 0x3f),
            0x80 | (charcode & 0x3f)
          );
        }
      }
      return new Uint8Array(utf8);
    }
  };
}

export default {};
