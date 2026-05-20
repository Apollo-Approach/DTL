import { getVenueDashboardStats } from '@/app/actions/venueActions';
import { createClient } from '@/lib/supabase/server';

export default async function VenueDashboardPage() {
  const stats = await getVenueDashboardStats();
  const supabase = await createClient();

  if (!stats) {
    return <div>Failed to load dashboard statistics.</div>;
  }

  // Get Venue Name
  const { data: venue } = await supabase.from('venues').select('name').eq('id', stats.venueId).single();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="border-l-4 border-fuchsia-500 pl-4 py-1">
        <h2 className="text-3xl font-black uppercase tracking-tighter">{venue?.name || 'Your Venue'}</h2>
        <p className="text-gray-400 font-mono text-sm mt-1">Lead Generation Dashboard</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric Card */}
        <div className="bg-white/5 border border-white/10 p-6 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-fuchsia-500 origin-left scale-x-0 group-hover:scale-x-100 transition-transform"></div>
          <p className="text-gray-400 font-bold text-xs uppercase tracking-wider mb-2">Scans Today</p>
          <p className="text-4xl font-black font-mono">{stats.scansToday}</p>
        </div>

        {/* Metric Card */}
        <div className="bg-white/5 border border-white/10 p-6 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-fuchsia-500 origin-left scale-x-0 group-hover:scale-x-100 transition-transform"></div>
          <p className="text-gray-400 font-bold text-xs uppercase tracking-wider mb-2">Total Scans</p>
          <p className="text-4xl font-black font-mono">{stats.totalScans}</p>
        </div>

        {/* Metric Card */}
        <div className="bg-white/5 border border-white/10 p-6 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-fuchsia-500 origin-left scale-x-0 group-hover:scale-x-100 transition-transform"></div>
          <p className="text-gray-400 font-bold text-xs uppercase tracking-wider mb-2">Active Promos</p>
          <p className="text-4xl font-black font-mono">{stats.activePromos}</p>
        </div>

        {/* Metric Card */}
        <div className="bg-white/5 border border-white/10 p-6 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-green-500 origin-left scale-x-0 group-hover:scale-x-100 transition-transform"></div>
          <p className="text-gray-400 font-bold text-xs uppercase tracking-wider mb-2">Total Accrued Fees</p>
          <p className="text-4xl font-black font-mono text-green-400">${stats.totalFees.toFixed(2)}</p>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 p-8 text-center mt-12 flex flex-col items-center justify-center space-y-4">
        <h3 className="text-xl font-bold">Ready to Scan Passes?</h3>
        <p className="text-gray-400 text-sm max-w-md mx-auto">
          Scan user QR codes at the door to validate their promotions and automatically trigger the lead generation fee.
        </p>
        <a 
          href="/venue/scan" 
          className="inline-block bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-black uppercase tracking-wider text-sm py-3 px-8 transition-colors"
        >
          Open Scanner
        </a>
      </div>
    </div>
  );
}
