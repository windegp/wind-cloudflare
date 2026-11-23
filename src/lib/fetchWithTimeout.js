/**
 * fetch() that gives up after `timeoutMs` so a stalled Worker or Firestore call
 * cannot leave the checkout spinner running forever.
 * On timeout it throws an Error with name "TimeoutError" and `userMessage` set.
 */
export async function fetchWithTimeout(input, init = {}, timeoutMs = 20000, timeoutMessage) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error(
        timeoutMessage || "الاتصال بطيء حالياً. تأكد من الإنترنت وحاول مرة أخرى. سلتك محفوظة."
      );
      timeoutError.name = "TimeoutError";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
