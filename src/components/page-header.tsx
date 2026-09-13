export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4 flex-wrap mb-8">
      <div>
        <h1 className="text-[26px] font-bold">{title}</h1>
        {subtitle ? <p className="text-ink-soft text-sm mt-1 max-w-[60ch]">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}
