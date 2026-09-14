import Link from "next/link";
import { btnStyles } from "@/components/ui";

// ── Landing page sections ─────────────────────────────────────────────────
// Written for a shop owner, not a marketer: what it does, what it costs them
// in time, and what they get back. No funnel jargon.

export function Section({
  id,
  eyebrow,
  title,
  lede,
  children,
  tone = "plain",
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  lede?: string;
  children?: React.ReactNode;
  tone?: "plain" | "tinted";
}) {
  return (
    <section
      id={id}
      className={`px-6 md:px-10 py-16 md:py-24 ${tone === "tinted" ? "bg-surface-2" : ""}`}
    >
      <div className="max-w-5xl mx-auto">
        {eyebrow && (
          <span className="block text-xs font-bold uppercase tracking-[0.14em] text-beet mb-3">
            {eyebrow}
          </span>
        )}
        <h2 className="text-[clamp(26px,3.6vw,38px)] font-extrabold leading-[1.12] max-w-[20ch]">
          {title}
        </h2>
        {lede && <p className="text-lg text-ink-soft max-w-[58ch] mt-4">{lede}</p>}
        {children && <div className="mt-10">{children}</div>}
      </div>
    </section>
  );
}

// The loop, as a shop owner experiences it.
const STEPS = [
  {
    n: "1",
    title: "You say what's happening",
    body: "“Biryani + Coke combo for ₹199 this weekend.” One sentence, typed the way you'd say it out loud.",
    hue: "beet",
  },
  {
    n: "2",
    title: "We work out what it needs",
    body: "A weekend promotion needs a flyer, posts, stories and a WhatsApp message — timed across four days, not dumped at once.",
    hue: "saffron",
  },
  {
    n: "3",
    title: "Everything gets written",
    body: "Different words for Instagram, Facebook and WhatsApp, in your tone. Plus a Reel plan you can film on your phone.",
    hue: "chili",
  },
  {
    n: "4",
    title: "You approve it",
    body: "You see the whole campaign before anything goes out. Change a word, regenerate it, or say no.",
    hue: "leaf",
  },
  {
    n: "5",
    title: "It publishes and learns",
    body: "Posts go out on schedule. We watch what worked and plan more of it next month — automatically.",
    hue: "peacock",
  },
];

const HUE_CLASSES: Record<string, { bg: string; text: string; bar: string }> = {
  beet: { bg: "bg-beet-tint", text: "text-beet-deep", bar: "bg-beet" },
  saffron: { bg: "bg-saffron-tint", text: "text-saffron-deep", bar: "bg-saffron" },
  chili: { bg: "bg-chili-tint", text: "text-chili-deep", bar: "bg-chili" },
  leaf: { bg: "bg-leaf-tint", text: "text-leaf-deep", bar: "bg-leaf" },
  peacock: { bg: "bg-peacock-tint", text: "text-peacock-deep", bar: "bg-peacock" },
};

export function HowItWorks() {
  return (
    <ol className="grid gap-4 md:grid-cols-5">
      {STEPS.map((step) => {
        const hue = HUE_CLASSES[step.hue]!;
        return (
          <li
            key={step.n}
            className="bg-surface border border-line rounded-[16px] p-5 shadow-soft flex flex-col"
          >
            <span className={`h-1 w-10 rounded-full ${hue.bar} mb-4`} aria-hidden="true" />
            <span className={`text-[11px] font-extrabold tracking-[0.12em] ${hue.text} mb-2`}>
              STEP {step.n}
            </span>
            <h3 className="font-bold text-[15px] mb-2 leading-snug">{step.title}</h3>
            <p className="text-[13.5px] text-ink-soft leading-relaxed">{step.body}</p>
          </li>
        );
      })}
    </ol>
  );
}

const PROBLEMS = [
  {
    pain: "“I know I should post, but I never get to it.”",
    fix: "A month of marketing is planned before the month starts. You approve; it goes out.",
  },
  {
    pain: "“I don't know what to post about.”",
    fix: "We know your products, your customers and your quiet days. The plan comes from those, not from a template.",
  },
  {
    pain: "“Writing captions takes me an hour.”",
    fix: "Captions, stories, WhatsApp messages and Reel scripts are written for you, in your voice.",
  },
  {
    pain: "“I have an offer today — too late to plan anything.”",
    fix: "Type the offer. A full campaign is ready in under a minute, and the rest of your week reshuffles around it.",
  },
  {
    pain: "“I can't tell if any of it is working.”",
    fix: "Plain-language results: what brought people in, and what to do more of. No charts you need a course to read.",
  },
  {
    pain: "“Agencies want ₹25,000 a month.”",
    fix: "Starts at ₹999. No contract, no meetings, no brief to write.",
  },
];

export function ProblemGrid() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {PROBLEMS.map((item) => (
        <div key={item.pain} className="bg-surface border border-line rounded-[16px] p-5 shadow-soft">
          <p className="font-bold text-[15px] mb-2">{item.pain}</p>
          <p className="text-[14px] text-ink-soft leading-relaxed">{item.fix}</p>
        </div>
      ))}
    </div>
  );
}

// A worked example — the clearest way to show what "it figures it out" means.
export function WorkedExample() {
  const outputs = [
    { platform: "Flyer", tone: "chili", text: "₹199 · Saturday & Sunday · your logo, bottom right — print it or post it." },
    { platform: "Instagram", tone: "beet", text: "Short and visual, with the combo shot and three local hashtags." },
    { platform: "Facebook", tone: "peacock", text: "Longer, mentions T Nagar, tells people they can walk in or message." },
    { platform: "Stories", tone: "saffron", text: "Three across the weekend, ending with a last-chance on Sunday." },
    { platform: "WhatsApp", tone: "leaf", text: "A short message to your regulars — no hashtags, just the offer." },
    { platform: "Reel", tone: "chili", text: "A 15-second shot list: the biryani close up, the pour, the counter." },
  ];

  return (
    <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-6 items-start">
      <div className="bg-surface border-[1.5px] border-line-strong rounded-[22px] p-6 shadow-lift">
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-faint mb-3">
          What the owner types
        </div>
        <p className="text-[19px] font-semibold leading-snug">
          &ldquo;Biryani + Coke combo for ₹199 this weekend.&rdquo;
        </p>
        <div className="mt-5 pt-5 border-t border-line">
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-faint mb-2">
            What we don&apos;t do
          </div>
          <p className="text-[13.5px] text-ink-soft leading-relaxed">
            We never invent a price, a date or a phone number. If you hadn&apos;t said
            &ldquo;₹199&rdquo;, we&apos;d ask you for it rather than guess — and the price on your
            flyer is placed by us, not drawn by an image model, so it can&apos;t come out as ₹1,999.
          </p>
        </div>
      </div>

      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-faint mb-3">
          What comes back, about a minute later
        </div>
        <div className="grid sm:grid-cols-2 gap-2.5">
          {outputs.map((o) => {
            const hue = HUE_CLASSES[o.tone]!;
            return (
              <div key={o.platform} className="bg-surface border border-line rounded-[14px] p-4">
                <span className={`inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full ${hue.bg} ${hue.text} mb-2`}>
                  {o.platform}
                </span>
                <p className="text-[13px] text-ink-soft leading-relaxed">{o.text}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const DIFFERENCES = [
  {
    them: "Scheduling tools ask: “What do you want to post?”",
    us: "We ask: “What are you trying to achieve?” — then work backwards to the posts.",
  },
  {
    them: "AI writers give you a caption when you ask for one.",
    us: "We plan the month, write everything in it, and adjust when something changes.",
  },
  {
    them: "Agencies need a brief, a call, and two weeks.",
    us: "You need one sentence and about a minute.",
  },
];

export function Difference() {
  return (
    <div className="flex flex-col gap-3">
      {DIFFERENCES.map((d) => (
        <div
          key={d.them}
          className="grid md:grid-cols-2 gap-3 md:gap-6 bg-surface border border-line rounded-[16px] p-5"
        >
          <p className="text-[14.5px] text-ink-faint line-through decoration-ink-faint/40">{d.them}</p>
          <p className="text-[15px] font-semibold">{d.us}</p>
        </div>
      ))}
    </div>
  );
}

const FEATURES = [
  { title: "A plan for the whole month", body: "Built around your goal — more bookings, more orders, more walk-ins — not around filling a grid." },
  { title: "Instant campaigns", body: "Any offer, event or announcement becomes a complete campaign in about a minute." },
  { title: "Reels and Stories", body: "Shot-by-shot video plans you can film on a phone, with the caption already written." },
  { title: "Flyers in your brand", body: "Your colours, your logo, your prices — placed exactly, every time." },
  { title: "Your brand on everything", body: "Logo or name watermarked on images and burned into videos, so shares stay yours." },
  { title: "Approve before anything posts", body: "Manual, assisted or fully automatic. You decide, and you can pause it all." },
  { title: "Results in plain words", body: "“Hair-spa posts brought 11 of your 18 bookings.” No jargon, no dashboards to decode." },
  { title: "Your own website", body: "A public page for your business, built from what you've already told us." },
];

export function Features() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {FEATURES.map((f) => (
        <div key={f.title} className="bg-surface border border-line rounded-[16px] p-5 shadow-soft">
          <h3 className="font-bold text-[15px] mb-2">{f.title}</h3>
          <p className="text-[13.5px] text-ink-soft leading-relaxed">{f.body}</p>
        </div>
      ))}
    </div>
  );
}

export function Pricing({ plans }: { plans: Array<{ id: string; name: string; price: number; points: string[]; featured?: boolean }> }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {plans.map((plan) => (
        <div
          key={plan.id}
          className={`rounded-[22px] p-6 flex flex-col ${
            plan.featured
              ? "bg-surface border-2 border-beet shadow-lift"
              : "bg-surface border border-line shadow-soft"
          }`}
        >
          {plan.featured && (
            <span className="self-start text-[11px] font-extrabold uppercase tracking-[0.12em] text-beet mb-2">
              Most popular
            </span>
          )}
          <h3 className="font-bold text-lg">{plan.name}</h3>
          <div className="font-display text-[34px] font-extrabold leading-none mt-2 tnum">
            ₹{plan.price.toLocaleString("en-IN")}
            <span className="text-sm font-semibold text-ink-faint"> /month</span>
          </div>
          <ul className="flex flex-col gap-2 mt-5 mb-6 flex-1">
            {plan.points.map((p) => (
              <li key={p} className="text-[13.5px] text-ink-soft flex gap-2">
                <span className="text-leaf font-bold shrink-0" aria-hidden="true">✓</span>
                {p}
              </li>
            ))}
          </ul>
          <Link
            href="/register"
            className={plan.featured ? btnStyles.primary : btnStyles.secondary}
          >
            Start with {plan.name}
          </Link>
        </div>
      ))}
    </div>
  );
}

const FAQS = [
  {
    q: "Do I need to know anything about marketing?",
    a: "No. That's the point. You tell us what's happening in your business in plain words — a new dish, a slow Tuesday, an anniversary — and we work out what marketing it needs.",
  },
  {
    q: "Will it post things I haven't seen?",
    a: "Only if you tell it to. You start in Manual, where you approve every post. If you later switch to automatic, your rules still apply — a maximum per week, quiet hours, and approval for promotions if you want it.",
  },
  {
    q: "Can it make up a wrong price or phone number?",
    a: "No. The AI only ever uses facts you've given us, and prices and contact details on flyers are placed by our own renderer rather than drawn by an image model. If a detail is missing, we ask you instead of guessing.",
  },
  {
    q: "What about video? Everyone uses Reels now.",
    a: "We plan them. You get a hook, a shot-by-shot list with timings, what to say, and the caption — so filming takes about ten minutes on your phone. Upload old clips too and we'll add your brand mark and reuse them.",
  },
  {
    q: "Which platforms can it post to?",
    a: "Instagram and Facebook, once you connect them. WhatsApp, Google Business and LinkedIn are being added — the app tells you honestly what's connected and what isn't.",
  },
  {
    q: "What if I have more than one business?",
    a: "Each business is its own workspace with its own brand, products and results. Switching between them takes one click, and nothing is ever shared between them.",
  },
];

export function Faq() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {FAQS.map((item) => (
        <details
          key={item.q}
          className="bg-surface border border-line rounded-[16px] px-5 py-4 group"
        >
          <summary className="font-bold text-[15px] cursor-pointer list-none flex justify-between gap-3 items-start">
            {item.q}
            <span className="text-beet shrink-0 transition-transform group-open:rotate-45" aria-hidden="true">
              +
            </span>
          </summary>
          <p className="text-[14px] text-ink-soft leading-relaxed mt-3">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
