import Link from "next/link";
import { getSessionUser } from "@/server/tenant";
import { PLANS } from "@/server/plans";
import { btnStyles } from "@/components/ui";
import {
  Section,
  HowItWorks,
  ProblemGrid,
  WorkedExample,
  Difference,
  Features,
  Pricing,
  Faq,
} from "@/components/landing";

export const metadata = {
  title: "Markit — your AI marketing employee",
  description:
    "Tell us what's happening in your business. Markit plans, writes, designs and schedules the marketing — for salons, restaurants, gyms, bakeries and local shops.",
};

const PLAN_POINTS: Record<string, string[]> = {
  starter: [
    "One business",
    "A month of marketing planned for you",
    "Instagram + Facebook",
    "Flyers in your brand colours",
    "You approve everything",
  ],
  growth: [
    "Everything in Starter",
    "More platforms and more generations",
    "Reels and Story plans",
    "Results in plain language",
    "Campaigns can run automatically",
  ],
  pro: [
    "Everything in Growth",
    "Up to 5 businesses",
    "Your own domain",
    "Custom branding throughout",
    "Highest usage limits",
  ],
};

export default async function LandingPage() {
  // The landing page stays reachable when signed in — people share this link,
  // and bouncing a logged-in owner into onboarding makes the site look broken.
  // The header adapts instead.
  const user = await getSessionUser();

  const plans = (["starter", "growth", "pro"] as const).map((id) => ({
    id,
    name: PLANS[id].name,
    price: PLANS[id].priceInrMonthly,
    points: PLAN_POINTS[id]!,
    featured: id === "growth",
  }));

  return (
    <main>
      <header className="flex items-center justify-between px-6 md:px-10 py-5 max-w-6xl mx-auto w-full">
        <span className="font-display font-extrabold text-xl tracking-tight">
          markit<span className="text-beet">*</span>
        </span>
        <nav className="flex items-center gap-1 sm:gap-3">
          <a href="#how" className="hidden sm:inline text-sm font-semibold text-ink-soft hover:text-ink px-3 py-2">
            How it works
          </a>
          <a href="#pricing" className="hidden sm:inline text-sm font-semibold text-ink-soft hover:text-ink px-3 py-2">
            Pricing
          </a>
          {user ? (
            <Link href="/app" className={btnStyles.primary}>
              Go to my dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className={btnStyles.ghost}>
                Log in
              </Link>
              <Link href="/register" className={btnStyles.primary}>
                Get started
              </Link>
            </>
          )}
        </nav>
      </header>

      {/* Hero — the promise, in the owner's own words */}
      <section className="px-6 md:px-10 pt-12 pb-20 md:pt-20 md:pb-28 max-w-6xl mx-auto w-full">
        <span className="text-xs font-bold uppercase tracking-[0.14em] text-beet">
          Your AI marketing employee
        </span>
        <h1 className="text-[clamp(38px,6.6vw,68px)] font-extrabold leading-[1.04] max-w-[15ch] mt-4">
          Tell us what&apos;s happening. <span className="text-beet">We&apos;ll market it.</span>
        </h1>
        <p className="text-lg md:text-xl text-ink-soft max-w-[54ch] mt-6">
          You run a salon, a restaurant, a gym, a bakery. You don&apos;t have time to plan posts,
          write captions or design flyers. Say one sentence about your business — Markit does the
          rest, and waits for your OK before anything goes out.
        </p>
        <div className="flex flex-wrap gap-3 mt-8">
          <Link href={user ? "/app" : "/register"} className={btnStyles.idea}>
            {user ? "Go to my dashboard" : "Start marketing my business"}
          </Link>
          <a href="#how" className={btnStyles.secondary + " px-6 py-3 text-[15px]"}>
            See how it works
          </a>
        </div>
        <p className="text-[13px] text-ink-faint mt-4">
          Free to set up · No card needed · Nothing posts without your approval
        </p>
        <div className="flex gap-2.5 mt-14" aria-hidden="true">
          <span className="w-8 h-8 rounded-full bg-beet" />
          <span className="w-8 h-8 rounded-[50%_50%_50%_8px] bg-saffron" />
          <span className="w-8 h-8 rounded-full bg-chili" />
          <span className="w-8 h-8 rounded-[8px_50%_50%_50%] bg-leaf" />
          <span className="w-8 h-8 rounded-full bg-peacock" />
        </div>
      </section>

      <Section
        tone="tinted"
        eyebrow="Sound familiar?"
        title="Marketing is the job you never get to."
        lede="Every small business owner we've spoken to says a version of one of these."
      >
        <ProblemGrid />
      </Section>

      <Section
        id="how"
        eyebrow="How it works"
        title="Five steps. You're only involved in one of them."
        lede="This runs whether you think about it or not — that's what makes it an employee rather than a tool."
      >
        <HowItWorks />
      </Section>

      <Section
        tone="tinted"
        eyebrow="A real example"
        title="One sentence in. A weekend campaign out."
        lede="This is a restaurant in T Nagar with a weekend offer. The same thing works for a salon with a new treatment, or a bakery with 50 extra cakes."
      >
        <WorkedExample />
      </Section>

      <Section
        eyebrow="Why this is different"
        title="Most tools wait for instructions. This one has a plan."
      >
        <Difference />
      </Section>

      <Section
        tone="tinted"
        eyebrow="What you get"
        title="Everything a marketing person would do for you."
      >
        <Features />
      </Section>

      <Section
        id="pricing"
        eyebrow="Pricing"
        title="Less than one hour of an agency's time."
        lede="Change plan or leave whenever you like. Every plan includes the monthly marketing plan and your approval controls."
      >
        <Pricing plans={plans} />
      </Section>

      <Section tone="tinted" eyebrow="Questions" title="The things owners ask us first.">
        <Faq />
      </Section>

      {/* Closing CTA */}
      <section className="px-6 md:px-10 py-20 md:py-28">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-[clamp(28px,4.4vw,44px)] font-extrabold leading-[1.1]">
            You know your business. <span className="text-beet">We know the marketing.</span>
          </h2>
          <p className="text-lg text-ink-soft mt-5 max-w-[48ch] mx-auto">
            Set it up in about five minutes. Your first month of marketing is planned before you
            finish your coffee.
          </p>
          <div className="flex justify-center mt-8">
            <Link href={user ? "/app" : "/register"} className={btnStyles.idea}>
              {user ? "Go to my dashboard" : "Start marketing my business"}
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-line px-6 md:px-10 py-10">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <span className="font-display font-extrabold tracking-tight">
            markit<span className="text-beet">*</span>
          </span>
          <p className="text-[13px] text-ink-faint">
            Built for small businesses in India. Prices in ₹, GST extra.
          </p>
          <div className="flex gap-4 text-[13px] text-ink-soft">
            {user ? (
              <Link href="/app" className="hover:text-ink">My dashboard</Link>
            ) : (
              <>
                <Link href="/login" className="hover:text-ink">Log in</Link>
                <Link href="/register" className="hover:text-ink">Get started</Link>
              </>
            )}
          </div>
        </div>
      </footer>
    </main>
  );
}
