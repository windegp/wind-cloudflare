// Builds the hosted Kashier checkout URL used in the iframe. The hash and every other parameter are
// unchanged; the only addition is serverWebhook, so Kashier also posts each payment event to our webhook
// without needing a webhook registered in the Kashier dashboard.
// UNVERIFIED: Kashier documents serverWebhook for payment sessions, not for this hosted URL.
// If Kashier ignores it, nothing changes. The dashboard webhook still works alongside it.
export const KASHIER_SERVER_WEBHOOK_URL = "https://windeg.com/api/webhooks/kashier";

export function buildKashierCheckoutUrl(iframeData) {
  return (
    `https://checkout.kashier.io?` +
    `merchantId=${iframeData.merchantId}` +
    `&orderId=${iframeData.orderId}` +
    `&amount=${iframeData.amount}` +
    `&currency=${iframeData.currency}` +
    `&hash=${iframeData.hash}` +
    `&merchantRedirect=${encodeURIComponent(iframeData.merchantRedirect)}` +
    `&failureRedirect=${encodeURIComponent(iframeData.failureRedirect)}` +
    `&allowedMethods=${iframeData.allowedMethods}` +
    `&redirectMethod=get` +
    `&display=${iframeData.display}` +
    `&brandColor=${encodeURIComponent(iframeData.brandColor)}` +
    `&mode=${iframeData.mode}` +
    `&serverWebhook=${encodeURIComponent(KASHIER_SERVER_WEBHOOK_URL)}` +
    `&metaData=embedded`
  );
}
