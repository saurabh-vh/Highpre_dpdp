/** Skeleton shown while a dashboard page loads its data. */
export default function DashboardLoading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="mb-3 h-7 w-56 rounded-lg bg-white/[0.06]" />
      <div className="mb-8 h-4 w-96 max-w-full rounded bg-white/[0.04]" />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 rounded-panel border border-line bg-surface" />
        ))}
      </div>
      <div className="h-72 rounded-panel border border-line bg-surface" />
    </div>
  );
}
