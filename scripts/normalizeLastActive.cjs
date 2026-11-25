// Converts the old en-US format "7/16/2026, 12:21:07 PM" to the format used everywhere
// else ("YYYY-MM-DD HH:MM:SS"). Returns null when the value is already fine or unknown.
function normalizeLastActive(value) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i.exec(String(value || "").trim());
  if (!m) return null;
  let h = Number(m[4]) % 12;
  if (m[7].toUpperCase() === "PM") h += 12;
  const p = (n) => String(n).padStart(2, "0");
  return `${m[3]}-${p(m[1])}-${p(m[2])} ${p(h)}:${m[5]}:${m[6]}`;
}
module.exports = { normalizeLastActive };
