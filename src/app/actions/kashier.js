'use server'
import { generatePaymentHash } from '@/lib/kashier';
import { redirect } from 'next/navigation';

export async function initiateKashierPayment(amount) {
    const orderId = `ORD-${Date.now()}`; // يمكنك ربطه بـ order_count.txt لاحقاً
    const currency = "EGP";
    
    const hash = await generatePaymentHash(orderId, amount, currency);
    
    const params = new URLSearchParams({
        merchantId: process.env.KASHIER_MERCHANT_ID,
        orderId: orderId,
        amount: amount.toString(),
        currency: currency,
        hash: hash,
        merchantRedirect: process.env.KASHIER_REDIRECT_URL,
        mode: process.env.KASHIER_MODE,
        display: 'en' // أو 'ar' حسب لغة موقعك
    });

    const baseUrl = "https://checkout.kashier.io";
    redirect(`${baseUrl}/?${params.toString()}`);
}