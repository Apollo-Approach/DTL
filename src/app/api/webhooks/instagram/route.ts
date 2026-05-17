// src/app/api/webhooks/instagram/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import crypto from 'crypto';

// Use standard Supabase JS client with SERVICE ROLE for server-to-server admin bypass
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! 
);

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN;
const META_APP_SECRET = process.env.META_APP_SECRET;

// 1. Meta Webhook Verification (GET)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (!VERIFY_TOKEN) {
    return new NextResponse('Server configuration error', { status: 500 });
  }

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Meta Webhook Verified.');
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

// 2. Incoming Media Payload (POST)
export async function POST(request: Request) {
  try {
    if (!META_APP_SECRET) {
      return new NextResponse('Server configuration error', { status: 500 });
    }

    const signature = request.headers.get('x-hub-signature-256');
    if (!signature) {
      return new NextResponse('Missing signature', { status: 403 });
    }

    const rawBody = await request.text();
    const expectedSignature = 'sha256=' + crypto.createHmac('sha256', META_APP_SECRET).update(rawBody).digest('hex');

    if (signature !== expectedSignature) {
      return new NextResponse('Invalid signature', { status: 403 });
    }

    const body = JSON.parse(rawBody);

    // Standard Meta Graph API webhook payload structure
    if (body.object === 'instagram') {
      const entries = body.entry || [];
      
      for (const entry of entries) {
        const changes = entry.changes || [];
        for (const change of changes) {
          if (change.field === 'mentions' || change.field === 'hashtags') {
            const media = change.value;
            
            // Upsert into our database
            const { error: dbError } = await supabaseAdmin.from('social_posts').upsert({
              platform: 'INSTAGRAM',
              external_id: media.media_id,
              username: media.username || 'dtl_local',
              media_type: media.media_type === 'VIDEO' ? 'VIDEO' : 'IMAGE',
              media_url: media.media_url,
              permalink: media.permalink || `https://instagram.com/p/${media.media_id}`,
              caption: media.caption,
              posted_at: new Date().toISOString()
            }, { onConflict: 'external_id' });

            if (dbError) {
              console.error("Supabase Insert Error:", dbError);
              throw new Error(`DB Error: ${dbError.message}`);
            }
          }
        }
      }
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Webhook Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
