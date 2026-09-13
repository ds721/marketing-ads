import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ContentStatus } from "@prisma/client";

// ── Buttons ───────────────────────────────────────────────────────────────

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 font-semibold text-sm rounded-[10px] px-4 py-2.5 transition-transform hover:-translate-y-px active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none cursor-pointer";

export const btnStyles = {
  primary: cn(BTN_BASE, "bg-beet text-white shadow-soft"),
  secondary: cn(BTN_BASE, "border border-line-strong text-ink bg-transparent"),
  tonal: cn(BTN_BASE, "bg-saffron-tint text-saffron-deep"),
  danger: cn(BTN_BASE, "bg-chili-tint text-chili-deep"),
  ghost: cn(BTN_BASE, "text-ink-soft"),
  idea: cn(
    BTN_BASE,
    "bg-beet text-white rounded-full px-6 py-3 text-[15px] font-bold shadow-lift",
  ),
} as const;

type ButtonVariant = keyof typeof btnStyles;

export function Button({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={cn(btnStyles[variant], className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className,
  href,
  children,
}: {
  variant?: ButtonVariant;
  className?: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={cn(btnStyles[variant], className)}>
      {children}
    </Link>
  );
}

// ── Surfaces ──────────────────────────────────────────────────────────────

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "bg-surface border border-line rounded-[16px] p-5 shadow-soft",
        className,
      )}
      {...props}
    />
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-ink-faint mb-3">
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="text-center py-12 px-6">
      <h3 className="text-lg font-bold mb-1">{title}</h3>
      <p className="text-ink-soft text-sm max-w-md mx-auto mb-4">{body}</p>
      {action}
    </Card>
  );
}

// ── Status pills ──────────────────────────────────────────────────────────

const STATUS_STYLES: Record<ContentStatus, { label: string; cls: string; dot: string }> = {
  DRAFT: { label: "Draft", cls: "bg-surface border border-line text-ink-soft", dot: "bg-ink-faint" },
  AI_GENERATED: { label: "AI generated", cls: "bg-beet-tint text-beet-deep", dot: "bg-beet" },
  NEEDS_REVIEW: { label: "Needs review", cls: "bg-saffron-tint text-saffron-deep", dot: "bg-saffron" },
  APPROVED: { label: "Approved", cls: "bg-leaf-tint text-leaf-deep", dot: "bg-leaf" },
  SCHEDULED: { label: "Scheduled", cls: "bg-peacock-tint text-peacock-deep", dot: "bg-peacock" },
  PUBLISHING: { label: "Publishing", cls: "bg-peacock-tint text-peacock-deep", dot: "bg-peacock" },
  PUBLISHED: { label: "Published", cls: "bg-leaf text-on-accent", dot: "bg-on-accent" },
  FAILED: { label: "Failed", cls: "bg-chili-tint text-chili-deep", dot: "bg-chili" },
  ARCHIVED: { label: "Archived", cls: "bg-surface border border-line text-ink-faint", dot: "bg-ink-faint" },
};

export function StatusPill({ status }: { status: ContentStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap",
        s.cls,
      )}
    >
      <i className={cn("w-1.5 h-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}

export function Pill({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "beet" | "saffron" | "leaf" | "peacock" | "chili";
  children: React.ReactNode;
}) {
  const tones = {
    neutral: "bg-surface border border-line text-ink-soft",
    beet: "bg-beet-tint text-beet-deep",
    saffron: "bg-saffron-tint text-saffron-deep",
    leaf: "bg-leaf-tint text-leaf-deep",
    peacock: "bg-peacock-tint text-peacock-deep",
    chili: "bg-chili-tint text-chili-deep",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

// ── Platform chip ─────────────────────────────────────────────────────────

export const PLATFORMS: Record<string, { name: string; initials: string; color: string }> = {
  instagram: { name: "Instagram", initials: "ig", color: "linear-gradient(135deg,#7B2FF7,#F0466B,#FFA24B)" },
  facebook: { name: "Facebook", initials: "fb", color: "#1668D8" },
  whatsapp: { name: "WhatsApp", initials: "wa", color: "#1FAF54" },
  google_business: { name: "Google Business", initials: "gb", color: "#3D74D6" },
  linkedin: { name: "LinkedIn", initials: "in", color: "#0A66C2" },
};

export function PlatformBadge({ platform, size = 22 }: { platform: string; size?: number }) {
  const p = PLATFORMS[platform] ?? { name: platform, initials: "?", color: "#888" };
  return (
    <span
      title={p.name}
      className="inline-flex items-center justify-center rounded-full text-white font-extrabold not-italic shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.42, background: p.color }}
    >
      {p.initials}
    </span>
  );
}

// ── Form fields ───────────────────────────────────────────────────────────

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-semibold">
        {label}
      </label>
      {children}
      {hint ? <span className="text-xs text-ink-faint">{hint}</span> : null}
    </div>
  );
}

export const inputCls =
  "w-full bg-bg border-[1.5px] border-line-strong rounded-[10px] px-3.5 py-2.5 text-[14.5px] text-ink placeholder:text-ink-faint focus:border-beet focus:outline-none";

export function FormError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p className="bg-chili-tint text-chili-deep text-sm font-medium rounded-[10px] px-4 py-2.5">
      {error}
    </p>
  );
}

export function FormSuccess({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="bg-leaf-tint text-leaf-deep text-sm font-medium rounded-[10px] px-4 py-2.5">
      {message}
    </p>
  );
}
