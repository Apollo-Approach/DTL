import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// This would be invoked by a Vercel Cron Job or Supabase Edge Function scheduler every hour
export async function GET(request: Request) {
  // Simple auth check to prevent abuse of the cron endpoint
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

    // Find all active Panics or Safewalk alarms older than 12 hours
    const { data: staleIncidents, error } = await supabase
      .from('safety_incidents')
      .select('id, type, status, reported_at, description, lat, lng')
      .in('type', ['PANIC_ALARM', 'SAFEWALK_SOS'])
      .not('status', 'eq', 'RESOLVED')
      .lt('reported_at', twelveHoursAgo);

    if (error) {
      console.error('Error fetching stale incidents:', error);
      return NextResponse.json({ error: 'Failed to fetch incidents' }, { status: 500 });
    }

    if (!staleIncidents || staleIncidents.length === 0) {
      return NextResponse.json({ message: 'No stale incidents found. All good.' });
    }

    // In a real implementation, we would send an SMS or Email via Twilio/SendGrid to all M5 Sysadmins
    const { data: m5Admins } = await supabase
      .from('profiles')
      .select('id, phone_number')
      .eq('role', 'm5_sysadmin');

    console.log(`[CRON Escalation] Found ${staleIncidents.length} unresolved high-priority incidents older than 12 hours.`);
    
    // Simulate notification payload
    const notificationPayload = {
      recipients: m5Admins?.map(admin => admin.phone_number).filter(Boolean) || [],
      message: `URGENT: ${staleIncidents.length} panic/safewalk alarms have been unresolved for >12 hours. Please review the Crisis Cloud dashboard immediately.`,
      incidents: staleIncidents
    };

    console.log('Dispatching notifications:', notificationPayload);

    // TODO: Acknowledge/mark that we sent a notification so we don't spam every hour, 
    // or just rely on the 12-hour cadence logic (e.g., adding a 'last_escalated_at' column to safety_incidents).

    return NextResponse.json({ 
      success: true, 
      escalatedCount: staleIncidents.length,
      notifiedSysadmins: m5Admins?.length || 0
    });

  } catch (err: unknown) {
    console.error('Cron job error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
