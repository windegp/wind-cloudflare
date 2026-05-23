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
 */
export function getCairoDayBoundaries(dateStr) {
  return {
    start: dateStr + ' 00:00:00',
    end: dateStr + ' 23:59:59',
    startMs: Date.parse(dateStr + 'T00:00:00+02:00'),
    endMs: Date.parse(dateStr + 'T23:59:59+02:00'),
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
 * Get list of date strings between two dates (inclusive)
 */
export function getDateRange(dateStart, dateEnd) {
  const dates = [];
  const current = new Date(dateStart + 'T00:00:00+02:00');
  const end = new Date(dateEnd + 'T00:00:00+02:00');
  while (current <= end) {
    dates.push(getCairoDateStr(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}