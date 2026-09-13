const STEPS = ["Business", "About", "Products", "Audience", "Goals", "Frequency"] as const;

export function OnboardingShell({
  step,
  title,
  subtitle,
  children,
}: {
  step: number; // 1-based
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen max-w-xl mx-auto px-6 py-12">
      <div className="font-display font-extrabold text-lg tracking-tight mb-8">
        markit<span className="text-beet">*</span>
      </div>
      <ol className="flex gap-1.5 mb-8" aria-label="Setup progress">
        {STEPS.map((s, i) => (
          <li
            key={s}
            aria-current={i + 1 === step ? "step" : undefined}
            className={`h-1.5 flex-1 rounded-full ${i + 1 <= step ? "bg-beet" : "bg-line"}`}
            title={s}
          />
        ))}
      </ol>
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-beet mb-2">
        Step {step} of {STEPS.length} · {STEPS[step - 1]}
      </p>
      <h1 className="text-[28px] font-bold mb-2">{title}</h1>
      {subtitle ? <p className="text-ink-soft mb-8 max-w-[52ch]">{subtitle}</p> : <div className="mb-8" />}
      {children}
    </main>
  );
}
