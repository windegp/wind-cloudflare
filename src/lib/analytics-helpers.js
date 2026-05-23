// ═══════════════════════════════════════════════════════════
// ANALYTICS SHARED HELPERS — ALL timezone = Africa/Cairo
// ═══════════════════════════════════════════════════════════

/**
 * Get Cairo date string "YYYY-MM-DD" from any Date object
 */
export function getCairoDateStr(date) {
  const cairoStr = date.toLocaleString('en-US', { timeZone: 'Africa/Cairo' });
  const cairoDate = new Date(cairoStr);
  const pad = (n) => String(n).padStart(2, '0');
  return `${cairoDate.getFullYear()}-${pad(cairoDate.getMonth()+1)}-${pad(cairoDate.getDate())}`;
}

/**
 * Get Cairo date boundaries for queries
 * 
 * Uses noon-to-noon technique to determine the actual Cairo timezone offset
 * for the given date, avoiding any hardcoded offset assumptions.
 * This is SERVER-TIMEZONE-INDEPENDENT — it always computes correct offsets.
 * 
 * Egypt observes EET (UTC+2) and EEST (UTC+3) during DST.
 * The noon reference is used because it never straddles a calendar day boundary.
 */
export function getCairoDayBoundaries(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  
  // Use noon UTC to determine Cairo's actual offset for this date
  const noonUTC = Date.UTC(year, month - 1, day, 12, 0, 0);
  const noonDate = new Date(noonUTC);
  
  // Get Cairo's date-time components for noon UTC using Intl.DateTimeFormat
  // CRITICAL: Use Date.UTC() to reconstruct the Cairo time as UTC milliseconds.
  // Do NOT use `new Date(string)` for the Cairo time string, as that would be
  // parsed in the SERVER's local timezone, not UTC.
  const cairoParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  }).formatToParts(noonDate);
  
  const getPart = (type) => parseInt(cairoParts.find(p => p.type === type).value, 10);
  const cairoYear = getPart('year');
  const cairoMonth = getPart('month');
  const cairoDay = getPart('day');
  const cairoHour = getPart('hour');
  const cairoMinute = getPart('minute');
  
  // Reconstruct Cairo's UTC timestamp from components using Date.UTC
  const cairoMs = Date.UTC(cairoYear, cairoMonth - 1, cairoDay, cairoHour, cairoMinute, 0);
  
  // Cairo's offset from UTC in milliseconds (+2h or +3h)
  const cairoOffsetMs = cairoMs - noonUTC;
  
  // Start of Cairo day in UTC milliseconds
  const startMs = Date.UTC(year, month - 1, day, 0, 0, 0) - cairoOffsetMs;
  
  // End of Cairo day (inclusive) = start + 24h - 1ms
  const endMs = startMs + 86400000 - 1;
  
  return {
    start: dateStr + ' 00:00:00',
    end: dateStr + ' 23:59:59',
    startMs,
    endMs,
  };
}

/**
 * Parse any date format to milliseconds
 */
export function parseDateToMs(rawDate) {
  if (!rawDate) return NaN;
  if (typeof rawDate.toDate === 'function') return rawDate.toDate().getTime();
  if (rawDate instanceof Date) return rawDate.getTime();
  if (typeof rawDate !== 'string') return NaN;
  const ms = Date.parse(rawDate);
  if (!isNaN(ms)) return ms;
  const usMatch = rawDate.match(/(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s*(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/i);
  if (usMatch) {
    let [_, month, day, year, hours, minutes, seconds, ampm] = usMatch;
    hours = parseInt(hours);
    if (ampm.toUpperCase() === 'PM' && hours !== 12) hours += 12;
    if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
    return new Date(parseInt(year), parseInt(month)-1, parseInt(day), hours, parseInt(minutes), parseInt(seconds)).getTime();
  }
  const withT = rawDate.replace(' ', 'T').split('+')[0].trim();
  const ms2 = Date.parse(withT);
  if (!isNaN(ms2)) return ms2;
  return NaN;
}

/**
 * Check if customer is a real purchasing customer
 */
export function isRealCustomer(c) {
  if (!c) return false;
  return (
    (c.segments && Array.isArray(c.segments) && 
     (c.segments.includes('Purchased_Once') || c.segments.includes('VIP_Customer'))) ||
    Number(c['Total Orders'] || 0) > 0
  );
}

/**
 * Generate Cairo-formatted timestamp "YYYY-MM-DD HH:MM:SS"
 */
export function getCairoTimestamp() {
  const cairoStr = new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' });
  const cairoDate = new Date(cairoStr);
  const pad = (n) => String(n).padStart(2, '0');
  return `${cairoDate.getFullYear()}-${pad(cairoDate.getMonth()+1)}-${pad(cairoDate.getDate())} ${pad(cairoDate.getHours())}:${pad(cairoDate.getMinutes())}:${pad(cairoDate.getSeconds())}`;
}

/**
 * Format a Date object to Cairo date string "YYYY-MM-DD"
 * Always uses Cairo timezone via getCairoDateStr.
 * CRITICAL: DO NOT use d.getFullYear()/getMonth()/getDate() directly
 * as those return LOCAL timezone values, not Cairo timezone.
 */
export function formatCairoDate(d) {
  return getCairoDateStr(d);
}

/**
 * Get list of date strings between two dates (inclusive)
 * 
 * Uses noon reference time to avoid timezone offset boundary issues.
 * The loop starts at noon local time and increments by 1 day,
 * converting each to Cairo date string. Noon is always on the correct
 * calendar date regardless of timezone offset vs UTC.
 */
export function getDateRange(dateStart, dateEnd) {
  const dates = [];
  // Parse start/end date strings into UTC noon timestamps.
  // Using noon ensures the Date object is always on the correct calendar date
  // when converted to Cairo timezone, regardless of Cairo's UTC offset.
  const [sy, sm, sd] = dateStart.split('-').map(Number);
  const [ey, em, ed] = dateEnd.split('-').map(Number);
  const current = new Date(Date.UTC(sy, sm - 1, sd, 12, 0, 0));
  const end = new Date(Date.UTC(ey, em - 1, ed, 12, 0, 0));
  while (current <= end) {
    dates.push(getCairoDateStr(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}
