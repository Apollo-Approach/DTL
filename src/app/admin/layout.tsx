import { redirect } from 'next/navigation';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // 1. Get the current session
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !session) {
    redirect('/admin/login');
  }

  // 2. Query the profiles table to check the role
  const adminSupabase = await createAdminClient();
  const { data: profile, error: profileError } = await adminSupabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single();

  if (profileError || !profile) {
    // Failsafe: if no profile exists, kick them out
    redirect('/admin/login');
  }

  // 3. Enforce RBAC
  if (!['m2_responder', 'm3_admin', 'm4_police', 'm5_sysadmin'].includes(profile.role)) {
    // If they are just a 'citizen' or 'm1_observer', deny access.
    // In a real app, you might redirect to a "Not Authorized" page.
    redirect('/?error=unauthorized');
  }

  // 4. Authorized! Render the layout
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Top Navigation Bar for Admins */}
      <nav className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-md px-6 py-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center font-bold">
            DTL
          </div>
          <div>
            <h1 className="font-bold text-sm">London Civic Dashboard</h1>
            <p className="text-xs text-indigo-400">Responder Gateway ({profile.role})</p>
          </div>
          <div className="flex gap-4 ml-8">
            <a href="/admin/dashboard" className="text-sm font-medium text-neutral-300 hover:text-white">Dashboard</a>
            <a href="/admin/venues" className="text-sm font-medium text-neutral-300 hover:text-white">Venues</a>
          </div>
        </div>
        
        <form action="/auth/signout" method="POST">
          <button type="submit" className="text-xs font-bold text-neutral-400 hover:text-white transition-colors">
            Sign Out
          </button>
        </form>
      </nav>

      {/* Main Content Area */}
      <main className="p-6">
        {children}
      </main>
    </div>
  );
}
