import Link from 'next/link';

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8 md:p-16 selection:bg-cyan-500 selection:text-white">
      <div className="max-w-3xl mx-auto space-y-8">
        <Link href="/" className="inline-block text-xs uppercase tracking-[0.2em] text-cyan-400 font-black mb-8 hover:text-cyan-300">
          ← Back to DTL Nightly
        </Link>
        
        <h1 className="text-4xl font-black uppercase tracking-tight">Terms of Service</h1>
        <p className="text-zinc-500 font-medium">Last updated: May 20, 2026</p>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-cyan-400">1. Acceptance of Terms</h2>
          <p className="text-zinc-400 leading-relaxed">
            By accessing or using the DTL Nightly platform ("Service"), you agree to be bound by these Terms of Service. If you do not agree to all the terms and conditions of this agreement, you may not access the website or use any services.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-cyan-400">2. Description of Service</h2>
          <p className="text-zinc-400 leading-relaxed">
            DTL Nightly provides a platform for discovering, reviewing, and interacting with nightlife venues and events. The Service may include location-based features, social networking tools, and promotional offerings from partner venues.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-cyan-400">3. User Conduct</h2>
          <p className="text-zinc-400 leading-relaxed">
            You agree to use the Service only for lawful purposes. You are prohibited from:
          </p>
          <ul className="list-disc list-inside text-zinc-400 leading-relaxed space-y-2">
            <li>Violating any local, state, national, or international laws.</li>
            <li>Harassing, threatening, or defrauding other users.</li>
            <li>Transmitting any content that is offensive, harmful, or defamatory.</li>
            <li>Attempting to interfere with the security or operation of the Service.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-cyan-400">4. Modifications to Service</h2>
          <p className="text-zinc-400 leading-relaxed">
            DTL Nightly reserves the right to modify or discontinue, temporarily or permanently, the Service (or any part thereof) with or without notice. We shall not be liable to you or to any third party for any modification, suspension, or discontinuance of the Service.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-cyan-400">5. Governing Law</h2>
          <p className="text-zinc-400 leading-relaxed">
            These Terms shall be governed and construed in accordance with the laws of Ontario, Canada, without regard to its conflict of law provisions.
          </p>
        </section>
      </div>
    </div>
  );
}
