import Link from 'next/link';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8 md:p-16 selection:bg-cyan-500 selection:text-white">
      <div className="max-w-3xl mx-auto space-y-8">
        <Link href="/" className="inline-block text-xs uppercase tracking-[0.2em] text-cyan-400 font-black mb-8 hover:text-cyan-300">
          ← Back to DTL Nightly
        </Link>
        
        <h1 className="text-4xl font-black uppercase tracking-tight">Privacy Policy</h1>
        <p className="text-zinc-500 font-medium">Last updated: May 20, 2026</p>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-cyan-400">1. Information We Collect</h2>
          <p className="text-zinc-400 leading-relaxed">
            When you use DTL Nightly, we collect information you provide directly to us, such as when you create or modify your account, contact customer support, or otherwise communicate with us. This information may include: name, email, phone number, postal address, profile picture, and other information you choose to provide.
          </p>
          <p className="text-zinc-400 leading-relaxed">
            We also collect location data to provide location-based services, such as venue discovery and safety features. You can enable or disable location tracking at any time through your device settings.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-cyan-400">2. How We Use Your Information</h2>
          <p className="text-zinc-400 leading-relaxed">
            We use the information we collect to:
          </p>
          <ul className="list-disc list-inside text-zinc-400 leading-relaxed space-y-2">
            <li>Provide, maintain, and improve our services.</li>
            <li>Process transactions and send related information.</li>
            <li>Send technical notices, updates, security alerts, and support messages.</li>
            <li>Respond to your comments, questions, and requests.</li>
            <li>Communicate with you about products, services, offers, and events.</li>
            <li>Personalize and improve the services and provide content or features that match user profiles or interests.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-cyan-400">3. Sharing of Information</h2>
          <p className="text-zinc-400 leading-relaxed">
            We do not share your personal information with third parties except as described in this privacy policy or in connection with the services provided. We may share information with vendors, consultants, and other service providers who need access to such information to carry out work on our behalf.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-cyan-400">4. Contact Us</h2>
          <p className="text-zinc-400 leading-relaxed">
            If you have any questions about this Privacy Policy, please contact us at support@dtlnightly.ca.
          </p>
        </section>
      </div>
    </div>
  );
}
