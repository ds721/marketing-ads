import Link from "next/link";

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="font-display font-extrabold text-xl tracking-tight">
          markit<span className="text-beet">*</span>
        </Link>
        <h1 className="text-[26px] font-bold mt-6 mb-1">{title}</h1>
        {subtitle ? <p className="text-ink-soft text-sm mb-6">{subtitle}</p> : <div className="mb-6" />}
        {children}
      </div>
    </main>
  );
}
