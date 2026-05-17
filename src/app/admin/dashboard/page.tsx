export default function AdminDashboard() {
  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Aggregate Civic Data</h1>
        <p className="text-neutral-400">View and manage reported safety incidents and transit bottlenecks.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Mock Stat Cards */}
        <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-2xl">
          <h3 className="text-neutral-400 text-sm font-bold mb-1">Active Mod Pins</h3>
          <p className="text-4xl font-black text-red-500">12</p>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-2xl">
          <h3 className="text-neutral-400 text-sm font-bold mb-1">Delayed Buses</h3>
          <p className="text-4xl font-black text-yellow-500">3</p>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-2xl">
          <h3 className="text-neutral-400 text-sm font-bold mb-1">System Status</h3>
          <p className="text-4xl font-black text-emerald-500">Nominal</p>
        </div>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl h-96 flex items-center justify-center">
        <p className="text-neutral-500 font-medium">[ Heatmap & Data Table Coming Soon ]</p>
      </div>
    </div>
  );
}
