// src/lib/nfc/sdmVerifier.ts
// NTAG 424 DNA Secure Dynamic Messaging verification engine
// Handles PICCData decryption, CMAC verification, and replay protection

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { validationAes } from 'ntag424';
import { generatePassCode } from '@/lib/utils/idGenerator';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface VerificationResult {
  success: boolean;
  error?: 'missing_params' | 'unknown_tag' | 'invalid_signature' | 'already_used' | 'tag_inactive' | 'no_promotion' | 'internal_error';
  couponToken?: string;
  tagId?: string;
  promotionId?: string;
  venueId?: string;
}

interface NfcTag {
  id: string;
  uid: string;
  venue_id: string;
  promotion_id: string | null;
  location_label: string | null;
  sdm_file_read_key: string;
  sdm_meta_read_key: string;
  last_tap_counter: number;
  coupon_expiry_minutes: number;
  is_active: boolean;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/**
 * Convert a hex string to a Buffer.
 */
function hexToBuffer(hex: string): Buffer {
  return Buffer.from(hex, 'hex');
}

/**
 * Generate a human-readable coupon token using the existing passcode generator.
 * Format: Brave-Golden-Orca (Adjective-Adjective-Noun)
 * Collisions are negligible given the 15-minute expiry window.
 */
export function generateCouponToken(): string {
  return generatePassCode();
}

/**
 * Create a Supabase client with service role credentials.
 * Required because nfc_tags contains sensitive AES keys behind RLS.
 */
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ────────────────────────────────────────────────────────────
// Core Verification Flow
// ────────────────────────────────────────────────────────────

/**
 * Verify an NFC tap from an NTAG 424 DNA tag.
 *
 * URL format: /api/nfc/verify?t=TAG_SHORT_ID&e=PICC_DATA&c=CMAC
 *
 * @param tagShortId  - Short identifier for the tag (first 8 chars of UUID or uid)
 * @param encPiccData - Encrypted PICCData hex string from the tag's SDM output
 * @param cmac        - CMAC hex string from the tag's SDM output
 * @param userAgent   - Client User-Agent for audit logging
 * @param ipAddress   - Client IP for audit logging
 */
export async function verifyNfcTap(
  tagShortId: string | null,
  encPiccData: string | null,
  cmac: string | null,
  userAgent: string | null,
  ipAddress: string | null
): Promise<VerificationResult> {
  // 1. Validate required parameters
  if (!encPiccData || !cmac) {
    return { success: false, error: 'missing_params' };
  }

  const supabase = getServiceClient();

  try {
    // 2. Look up the tag
    let tag: NfcTag | null = null;

    if (tagShortId) {
      // Efficient lookup: tag short ID provided in URL
      const { data, error } = await supabase
        .from('nfc_tags')
        .select('*')
        .or(`uid.ilike.${tagShortId}%,id.ilike.${tagShortId}%`)
        .limit(1)
        .single();

      if (error || !data) {
        return { success: false, error: 'unknown_tag' };
      }
      tag = data as NfcTag;
    } else {
      // Fallback: try all active tags (expensive, avoid in production)
      const { data: tags, error } = await supabase
        .from('nfc_tags')
        .select('*')
        .eq('is_active', true);

      if (error || !tags?.length) {
        return { success: false, error: 'unknown_tag' };
      }

      // Try to decrypt PICCData with each tag's meta key
      for (const candidate of tags as NfcTag[]) {
        try {
          const metaKey = hexToBuffer(candidate.sdm_meta_read_key);
          const fileKey = hexToBuffer(candidate.sdm_file_read_key);
          const piccBuf = hexToBuffer(encPiccData);
          const cmacBuf = hexToBuffer(cmac);

          const result = validationAes.validateAndDecryptPicc(metaKey, fileKey, piccBuf, cmacBuf);
          if (result) {
            tag = candidate;
            break;
          }
        } catch {
          // This key didn't work, try next
          continue;
        }
      }

      if (!tag) {
        return { success: false, error: 'unknown_tag' };
      }
    }

    // 3. Check tag is active
    if (!tag.is_active) {
      return { success: false, error: 'tag_inactive' };
    }

    // 4. Decrypt PICCData and verify CMAC
    const metaKey = hexToBuffer(tag.sdm_meta_read_key);
    const fileKey = hexToBuffer(tag.sdm_file_read_key);
    const piccBuf = hexToBuffer(encPiccData);
    const cmacBuf = hexToBuffer(cmac);

    const decrypted = validationAes.validateAndDecryptPicc(metaKey, fileKey, piccBuf, cmacBuf);

    if (!decrypted) {
      // CMAC signature mismatch — possible tampering
      await logTap(supabase, {
        tag_id: tag.id,
        tap_counter: -1,
        verified: false,
        replay_attempt: false,
        user_agent: userAgent,
        ip_address: ipAddress,
      });
      return { success: false, error: 'invalid_signature' };
    }

    const tapCounter = decrypted.counter ?? 0;

    // 5. Replay protection: counter must be strictly greater
    if (tapCounter <= tag.last_tap_counter) {
      await logTap(supabase, {
        tag_id: tag.id,
        tap_counter: tapCounter,
        verified: true,
        replay_attempt: true,
        user_agent: userAgent,
        ip_address: ipAddress,
      });
      return { success: false, error: 'already_used' };
    }

    // 6. Check promotion exists
    if (!tag.promotion_id) {
      return { success: false, error: 'no_promotion' };
    }

    // 7. Issue single-use coupon token
    const couponToken = generateCouponToken();
    const expiresAt = new Date(Date.now() + tag.coupon_expiry_minutes * 60 * 1000);

    // 8. Update tag counter (atomic)
    const { error: updateErr } = await supabase
      .from('nfc_tags')
      .update({
        last_tap_counter: tapCounter,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tag.id)
      .lt('last_tap_counter', tapCounter); // Ensure no race condition

    if (updateErr) {
      console.error('[NFC] Counter update failed:', updateErr.message);
      return { success: false, error: 'internal_error' };
    }

    // 9. Log the successful tap
    await logTap(supabase, {
      tag_id: tag.id,
      tap_counter: tapCounter,
      verified: true,
      replay_attempt: false,
      coupon_token: couponToken,
      coupon_expires_at: expiresAt.toISOString(),
      user_agent: userAgent,
      ip_address: ipAddress,
    });

    return {
      success: true,
      couponToken,
      tagId: tag.id,
      promotionId: tag.promotion_id,
      venueId: tag.venue_id,
    };

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[NFC] Verification error:', message);
    return { success: false, error: 'internal_error' };
  }
}

// ────────────────────────────────────────────────────────────
// Audit Logging
// ────────────────────────────────────────────────────────────

interface TapLogEntry {
  tag_id: string;
  tap_counter: number;
  verified: boolean;
  replay_attempt: boolean;
  coupon_token?: string;
  coupon_expires_at?: string;
  user_agent: string | null;
  ip_address: string | null;
}

async function logTap(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  entry: TapLogEntry
) {
  const { error } = await supabase
    .from('nfc_tap_log')
    .insert({
      tag_id: entry.tag_id,
      tap_counter: entry.tap_counter,
      verified: entry.verified,
      replay_attempt: entry.replay_attempt,
      coupon_token: entry.coupon_token ?? null,
      coupon_expires_at: entry.coupon_expires_at ?? null,
      user_agent: entry.user_agent,
      ip_address: entry.ip_address,
    });

  if (error) {
    console.error('[NFC] Tap log insert failed:', error.message);
  }
}
