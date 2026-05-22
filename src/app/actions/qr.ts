'use server';

import { createHmac } from 'crypto';

export async function generateSignedQrPayload(promotionId: string) {
  const timestamp = Date.now();
  
  // Create the raw payload
  const payloadData = {
    promo: promotionId,
    timestamp: timestamp
  };
  const payloadString = JSON.stringify(payloadData);
  
  // Sign the payload
  const secret = process.env.QR_SIGNING_SECRET || process.env.CRON_SECRET || 'fallback_secret_for_development_only';
  const hmac = createHmac('sha256', secret).update(payloadString).digest('hex');
  
  // Return the combined payload and signature
  return JSON.stringify({
    data: payloadData,
    signature: hmac
  });
}

export async function verifySignedQrPayload(qrPayloadString: string) {
  try {
    const parsed = JSON.parse(qrPayloadString);
    if (!parsed.data || !parsed.signature) {
      return { success: false, error: 'Invalid payload format' };
    }
    
    // Check expiration (e.g. 5 minutes)
    const timestamp = parsed.data.timestamp;
    if (Date.now() - timestamp > 5 * 60 * 1000) {
      return { success: false, error: 'QR code expired' };
    }

    const payloadString = JSON.stringify(parsed.data);
    const secret = process.env.QR_SIGNING_SECRET || process.env.CRON_SECRET || 'fallback_secret_for_development_only';
    const expectedHmac = createHmac('sha256', secret).update(payloadString).digest('hex');
    
    if (expectedHmac !== parsed.signature) {
      return { success: false, error: 'Invalid signature' };
    }
    
    return { success: true, data: parsed.data };
  } catch {
    return { success: false, error: 'Malformed QR code' };
  }
}
