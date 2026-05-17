import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';

export const metadata = {
  title: 'My Wallet | DTL Nightly',
};

export default async function WalletPage() {
  const supabase = await createClient();

  // Ensure user is authenticated
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?next=/wallet');
  }

  // Fetch user's passes with associated promotion details
  const { data: passes } = await supabase
    .from('user_passes')
    .select(`
      id,
      status,
      issued_at,
      promotions (
        title,
        discount_value,
        venues (
          name,
          address
        )
      )
    `)
    .eq('user_id', user.id)
    .order('issued_at', { ascending: false });

  const activePasses = passes?.filter(p => p.status === 'ISSUED') || [];
  const pastPasses = passes?.filter(p => p.status !== 'ISSUED') || [];

  return (
    <div className="min-h-screen bg-black text-white font-sans pb-24">
      <nav className="w-full border-b border-white/10 px-6 py-4 flex items-center justify-between sticky top-0 bg-black/80 backdrop-blur-md z-50">
        <Link href="/" className="text-sm font-bold text-zinc-400 hover:text-white uppercase tracking-widest transition-colors">
          ← Map
        </Link>
        <span className="text-[10px] uppercase tracking-[0.2em] text-cyan-500 font-black">Digital Wallet</span>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-12">
        <header className="mb-12">
          <h1 className="text-4xl font-black uppercase tracking-tight mb-2">My Passes</h1>
          <p className="text-zinc-400 font-medium text-sm">Present these codes at the door for priority entry and discounts.</p>
        </header>

        {activePasses.length === 0 ? (
          <div className="py-12 text-center bg-zinc-900/30 border border-dashed border-white/10 rounded-xl mb-12">
            <p className="text-zinc-500 font-bold uppercase tracking-widest text-sm mb-4">Your wallet is empty</p>
            <Link href="/" className="inline-block px-6 py-3 bg-white text-black font-black uppercase tracking-widest text-xs hover:bg-cyan-400 transition-colors shadow-[0_0_15px_rgba(255,255,255,0.1)]">
              Find Promotions
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-8 mb-16">
            {activePasses.map((pass: any) => (
              <div key={pass.id} className="relative bg-zinc-950 border border-white/20 rounded-2xl overflow-hidden shadow-[0_0_30px_rgba(168,85,247,0.15)]">
                {/* Visual styling */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-400 to-purple-500" />
                
                <div className="p-6 md:p-8 flex flex-col md:flex-row items-center gap-8">
                  {/* QR Code Container */}
                  <div className="bg-white p-4 rounded-xl shrink-0">
                    <QRCodeSVG value={pass.id} size={150} level="H" />
                  </div>
                  
                  {/* Details */}
                  <div className="flex-1 text-center md:text-left">
                    <div className="inline-block px-3 py-1 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-full text-[10px] font-black uppercase tracking-widest mb-3">
                      Active Pass
                    </div>
                    <h2 className="text-2xl font-black uppercase tracking-tight text-white mb-1">
                      {pass.promotions?.discount_value}
                    </h2>
                    <h3 className="text-lg font-bold text-zinc-300 mb-2">
                      {pass.promotions?.title}
                    </h3>
                    <p className="text-sm text-purple-400 font-bold tracking-wide uppercase">
                      @ {pass.promotions?.venues?.name}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* History */}
        {pastPasses.length > 0 && (
          <section>
            <h2 className="text-xl font-bold uppercase tracking-widest border-b border-white/10 pb-4 mb-6">History</h2>
            <div className="flex flex-col gap-4">
              {pastPasses.map((pass: any) => (
                <div key={pass.id} className="flex justify-between items-center p-4 bg-zinc-900/50 border border-white/5 rounded-lg opacity-60 grayscale">
                  <div>
                    <h4 className="font-bold text-sm text-white">{pass.promotions?.title}</h4>
                    <p className="text-xs text-zinc-500">@ {pass.promotions?.venues?.name}</p>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 bg-black rounded">
                    {pass.status}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
