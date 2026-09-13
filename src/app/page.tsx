import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/tenant";
import { btnStyles } from "@/components/ui";

export default async function LandingPage() {
  const user = await getSessionUser();
  if (user) redirect("/app");

  return (
    <main className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 md:px-12 py-5 max-w-6xl mx-auto w-full">
        <span className="font-display font-extrabold text-xl tracking-tight">
          markit<span className="text-beet">*</span>
        </span>
        <nav className="flex items-center gap-3">
          <Link href="/login" className={btnStyles.ghost}>
            Log in
          </Link>
          <Link href="/register" className={btnStyles.primary}>
            Get started
          </Link>
        </nav>
      </header>

      <section className="flex-1 flex flex-col justify-center max-w-6xl mx-auto w-full px-6 md:px-12 py-16">
        <span className="text-xs font-bold uppercase tracking-[0.14em] text-beet mb-4">
          Your AI marketing employee
        </span>
        <h1 className="text-[clamp(38px,6vw,64px)] font-extrabold leading-[1.05] max-w-[16ch]">
          Tell us what&apos;s happening. <span className="text-beet">We&apos;ll market it.</span>
        </h1>
        <p className="text-lg text-ink-soft max-w-[52ch] mt-6">
          Markit plans, writes, designs and schedules your marketing — for your salon,
          restaurant, gym or store. You just tell it things like{" "}
          <em>&ldquo;Biryani + Coke combo for ₹199 this weekend.&rdquo;</em>
        </p>
        <div className="flex gap-3 mt-8">
          <Link href="/register" className={btnStyles.idea}>
            Start marketing my business
          </Link>
        </div>
        <div className="flex gap-2.5 mt-12" aria-hidden="true">
          <span className="w-8 h-8 rounded-full bg-beet" />
          <span className="w-8 h-8 rounded-[50%_50%_50%_8px] bg-saffron" />
          <span className="w-8 h-8 rounded-full bg-chili" />
          <span className="w-8 h-8 rounded-[8px_50%_50%_50%] bg-leaf" />
          <span className="w-8 h-8 rounded-full bg-peacock" />
        </div>
      </section>
    </main>
  );
}
