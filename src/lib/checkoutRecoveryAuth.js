/** Constant-work comparison. Empty/misconfigured secrets never grant access. */
export function authorizedCheckoutRunner(request) {
  const secret = process.env.CHECKOUT_RECOVERY_SECRET;
  if (typeof secret !== "string" || secret.length < 32) return false;
  const supplied = request.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  if (supplied.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  return difference === 0;
}
