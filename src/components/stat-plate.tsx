interface StatItem {
  label: string;
  value: string | number;
}

// Spec plate of labelled stats (Days / Legs / Distance / Time…). Shared by the
// ride and leg detail pages so every stat card renders one consistent look.
export function StatPlate({ items }: { items: StatItem[] }) {
  return (
    <section class="ride-stats-card">
      {items.map((it) => (
        <div class="stat-item" key={it.label}>
          <span class="stat-label">{it.label}</span>
          <span class="stat-value">{it.value}</span>
        </div>
      ))}
    </section>
  );
}
