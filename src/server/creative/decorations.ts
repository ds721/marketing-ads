// ── Decorative motifs by business type ────────────────────────────────────
// Small vector shapes scattered behind the content — coffee beans for a
// café, confetti for a bakery, sparkles for a salon. Deterministic from a
// seed so the same campaign always draws the same way. Kept faint so they
// never fight the words.

type Motif = (x: number, y: number, s: number, fill: string) => string;

const bean: Motif = (x, y, s, fill) =>
  `<g transform="translate(${x} ${y}) rotate(-30)"><ellipse rx="${s}" ry="${s * 0.68}" fill="${fill}"/><path d="M ${-s * 0.6} ${-s * 0.15} Q 0 ${s * 0.5} ${s * 0.6} ${-s * 0.1}" stroke="#000" stroke-opacity="0.18" stroke-width="${s * 0.14}" fill="none"/></g>`;

const sparkle: Motif = (x, y, s, fill) =>
  `<path d="M ${x} ${y - s} Q ${x} ${y} ${x + s} ${y} Q ${x} ${y} ${x} ${y + s} Q ${x} ${y} ${x - s} ${y} Q ${x} ${y} ${x} ${y - s} Z" fill="${fill}"/>`;

const confetti: Motif = (x, y, s, fill) =>
  `<rect x="${x - s * 0.5}" y="${y - s * 0.2}" width="${s}" height="${s * 0.4}" rx="${s * 0.1}" fill="${fill}" transform="rotate(${((x + y) % 90) - 45} ${x} ${y})"/>`;

const leaf: Motif = (x, y, s, fill) =>
  `<path d="M ${x} ${y - s} C ${x + s} ${y - s * 0.4}, ${x + s} ${y + s * 0.6}, ${x} ${y + s} C ${x - s} ${y + s * 0.6}, ${x - s} ${y - s * 0.4}, ${x} ${y - s} Z" fill="${fill}" transform="rotate(${((x * 7) % 60) - 30} ${x} ${y})"/>`;

const ring: Motif = (x, y, s, fill) =>
  `<circle cx="${x}" cy="${y}" r="${s}" fill="none" stroke="${fill}" stroke-width="${s * 0.22}"/>`;

const dot: Motif = (x, y, s, fill) => `<circle cx="${x}" cy="${y}" r="${s * 0.5}" fill="${fill}"/>`;

const plus: Motif = (x, y, s, fill) =>
  `<path d="M ${x - s} ${y} H ${x + s} M ${x} ${y - s} V ${y + s}" stroke="${fill}" stroke-width="${s * 0.35}" stroke-linecap="round"/>`;

const SETS: Array<{ match: RegExp; motifs: Motif[] }> = [
  { match: /caf|coffee|tea|chai|bakery|cake|sweet|dessert/i, motifs: [bean, confetti, dot] },
  { match: /restaurant|food|biryani|kitchen|dhaba|hotel|catering/i, motifs: [leaf, dot, ring] },
  { match: /salon|spa|beauty|hair|nail|parlour|parlor|makeup/i, motifs: [sparkle, ring, dot] },
  { match: /gym|fitness|yoga|sport|crossfit/i, motifs: [plus, ring, dot] },
  { match: /boutique|fashion|cloth|retail|store|shop|jewel/i, motifs: [sparkle, confetti, dot] },
  { match: /clinic|dental|doctor|health|pharma|hospital/i, motifs: [plus, dot, ring] },
  { match: /tuition|school|class|academy|coaching|education/i, motifs: [plus, sparkle, dot] },
  { match: /event|party|celebrat|anniversary|wedding/i, motifs: [confetti, sparkle, dot] },
];

function pick(category: string | null | undefined): Motif[] {
  if (!category) return [dot, ring];
  return SETS.find((s) => s.match.test(category))?.motifs ?? [dot, ring];
}

/**
 * Scatter ~9 motifs around the edges of the canvas, away from the centre
 * where the words go. `seed` varies the arrangement per template.
 */
export function decorations(
  category: string | null | undefined,
  w: number,
  h: number,
  fill: string,
  opacity: number,
  seed = 1,
): string {
  const motifs = pick(category);
  let a = seed * 7919 + 104729;
  const rnd = () => ((a = (a * 9301 + 49297) % 233280) / 233280);
  const out: string[] = [];
  for (let i = 0; i < 9; i++) {
    // Keep to a band around the edges: outer 22% on each side.
    const side = rnd();
    const x = side < 0.5 ? rnd() * w * 0.22 : w - rnd() * w * 0.22;
    const y = rnd() * h;
    const s = w * (0.014 + rnd() * 0.02);
    const m = motifs[i % motifs.length]!;
    out.push(m(Math.round(x), Math.round(y), Math.round(s), fill));
  }
  return `<g opacity="${opacity}">${out.join("")}</g>`;
}
