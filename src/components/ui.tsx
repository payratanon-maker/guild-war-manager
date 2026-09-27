import { guildClasses, type GuildClassId } from "@/lib/guild-classes";

export function ClassBadge({ classId }: { classId: GuildClassId }) {
  const item = guildClasses.find(({ id }) => id === classId)!;
  return (
    <span
      className="class-badge"
      style={{ borderColor: item.color, color: item.color }}
    >
      <span className="class-dot" style={{ backgroundColor: item.color }} />
      {item.name}
    </span>
  );
}
export function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="panel stat-card">
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="empty-state">{children}</div>;
}
export function ErrorState({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="error-state">
      {children}
    </p>
  );
}
