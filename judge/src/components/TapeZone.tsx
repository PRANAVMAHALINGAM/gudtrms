import { AnimatePresence, motion } from 'framer-motion';
import { money, nameOf, shortDate } from '../data/format.ts';
import type { View } from '../data/timeline.ts';
import type { ProposalRow, Snapshot } from '../data/types.ts';
import { ItemCard, type Placed } from './Items.tsx';
import { Icon, Stamp, Ticker } from './pieces.tsx';

/* ---------- Duct tape down the middle: gray, wrinkled, and a little messy, like breakups ---------- */

/** Deterministic "random" in [0, 1), so the mess is the same on every render. */
const jitter = (i: number, seed: number) => {
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

const DUCT = [
  // creases where it got pressed down unevenly
  'repeating-linear-gradient(-14deg, transparent 0 70px, rgba(255,255,255,.2) 70px 73px, transparent 73px 150px, rgba(0,0,0,.12) 150px 152px, transparent 152px 230px)',
  // the fabric weave
  'repeating-linear-gradient(0deg, rgba(0,0,0,.08) 0 1px, transparent 1px 3px)',
  'repeating-linear-gradient(90deg, rgba(255,255,255,.07) 0 1px, transparent 1px 4px)',
  // silver sheen across the width
  'linear-gradient(90deg, #858683, #b8b9b6 28%, #a2a3a0 52%, #c9cac7 68%, #8f908d)',
].join(', ');

/** One half of the strip. The outer edge is a little wavy; the seam edge is straight until it tears. */
function halfShape(side: 'left' | 'right', torn: boolean, steps = 70): string {
  const outer: string[] = [];
  const seam: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const y = (i / steps) * 100;
    const wave = jitter(i, side === 'left' ? 1 : 2) * 7;
    const rip = torn ? 4 + jitter(i, side === 'left' ? 3 : 4) * 16 : 0;
    outer.push(side === 'left' ? `${wave}% ${y}%` : `${100 - wave}% ${y}%`);
    seam.push(side === 'left' ? `${100 - rip}% ${y}%` : `${rip}% ${y}%`);
  }
  return `polygon(${[...outer, ...seam.reverse()].join(', ')})`;
}

/** A short crooked piece with ragged torn-off ends. */
function patchShape(seed: number, steps = 8): string {
  const left: string[] = [];
  const right: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const y = (i / steps) * 100;
    left.push(`${jitter(i, seed) * 9}% ${y}%`);
    right.push(`${100 - jitter(i, seed + 7) * 9}% ${y}%`);
  }
  return `polygon(${[...left, ...right.reverse()].join(', ')})`;
}

const PATCHES = [
  { top: '8%', x: -14, w: 190, rotate: -21, seed: 11 },
  { top: '46%', x: 12, w: 170, rotate: 15, seed: 23 },
  { top: '81%', x: -6, w: 200, rotate: -8, seed: 37 },
];

export function Tape({ split }: { split: boolean }) {
  const half = (side: 'left' | 'right') => (
    <motion.div
      animate={split ? { x: side === 'left' ? -44 : 44, rotate: side === 'left' ? -1.4 : 1.4 } : { x: 0, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 90, damping: 14, delay: 0.2 }}
      style={{ width: 70, height: '100%', backgroundImage: DUCT, clipPath: halfShape(side, split) }}
    />
  );
  return (
    <div aria-hidden style={{ position: 'absolute', top: -40, bottom: -40, left: '50%', translate: '-50% 0', rotate: '0.8deg', filter: 'drop-shadow(0 2px 3px rgba(40,40,40,.28))' }}>
      <div style={{ display: 'flex', height: '100%' }}>{half('left')}{half('right')}</div>
      {PATCHES.map((p) => (
        <motion.div key={p.seed}
          animate={split ? { y: 80, rotate: p.rotate * 1.8, opacity: 0 } : { y: 0, rotate: p.rotate, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 80, damping: 14 }}
          style={{ position: 'absolute', top: p.top, left: '50%', marginLeft: -p.w / 2 + p.x, width: p.w, height: 56, backgroundImage: DUCT, clipPath: patchShape(p.seed) }} />
      ))}
    </div>
  );
}

function allocationLines(s: Snapshot, p: ProposalRow) {
  const who = (id: string | null) => nameOf(s.participants.find((x) => x.id === id));
  const gets: Record<string, string[]> = {};
  const cancelled: string[] = [];
  let bothOut = false;
  for (const item of s.items) {
    const slot = p.allocation[item.id];
    if (!slot) continue;
    if (item.kind === 'lease_break_fee') {
      if (slot.to) (gets[slot.to] ??= []).push(`pays the ${money(item.amount_cents ?? 0)} fee`);
      continue;
    }
    if (!slot.to) {
      if (item.kind === 'lease') bothOut = true; else cancelled.push(item.name);
      continue;
    }
    (gets[slot.to] ??= []).push(item.name);
    if (slot.weekends) (gets[slot.weekends] ??= []).push(`${item.name} every other weekend`);
  }
  return { gets, cancelled, bothOut, who };
}

function ProposalCard({ s, view }: { s: Snapshot; view: View }) {
  const p = view.current!;
  const { gets, cancelled, bothOut, who } = allocationLines(s, p);
  const t = p.transfer;
  const row = (label: string, value: string, key: string) => (
    <div key={key} style={{ display: 'grid', gridTemplateColumns: '112px 1fr', gap: 'var(--s2)', padding: '6px 0', alignItems: 'baseline', borderBottom: '1px solid var(--line)' }}>
      <span className="eyebrow" style={{ fontSize: 12 }}>{label}</span>
      <span style={{ fontWeight: 600, fontSize: 18, lineHeight: 1.3 }}>{value}</span>
    </div>
  );
  return (
    <motion.div key={p.id}
      initial={{ y: -70, scale: 1.08, opacity: 0 }}
      animate={{ y: 0, scale: 1, opacity: 1 }}
      exit={{ y: 30, opacity: 0, scale: 0.97, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 460, damping: 30 }}
      className="card"
      style={{ position: 'relative', width: 452, padding: 'var(--s3)', boxShadow: 'var(--shadow-lg)', zIndex: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'var(--s1)' }}>
        <span className="serif" style={{ fontSize: 28, fontWeight: 600 }}>Round {p.round} <span style={{ fontStyle: 'italic', fontWeight: 400, color: 'var(--ink-3)' }}>proposal</span></span>
        <span className="eyebrow" style={{ fontSize: 12 }}>from the mediator</span>
      </div>
      {s.participants.map((x) => row(`${nameOf(x)} gets`, (gets[x.id] ?? ['nothing']).join(', '), x.id))}
      {bothOut && row('Lease', 'You both move out', 'both')}
      {cancelled.length > 0 && row('Cancelled', cancelled.join(', '), 'cancel')}
      {row('Out by', shortDate(p.move_out_date), 'date')}
      <div style={{ marginTop: 'var(--s2)', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--s1)' }}>
        {t.from ? (
          <span style={{ fontSize: 20, fontWeight: 600 }}>
            {who(t.from)} pays {who(t.to)}{' '}
            <Ticker cents={t.total_cents} style={{ color: 'var(--accent)', fontSize: 30, fontFamily: 'var(--font-display)', fontWeight: 600 }} />
          </span>
        ) : <span style={{ fontSize: 20, fontWeight: 600 }}>No money changes hands</span>}
        {t.from && t.deposit_cents !== 0 && (
          <span className="num" style={{ fontSize: 14, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
            {money(t.buyout_cents)} buyout + {money(t.deposit_cents)} deposit
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 'var(--s1)', marginTop: 'var(--s2)' }}>
        {s.participants.map((x) => {
          const d = view.decisions[x.id];
          return (
            <span key={x.id} className="pill" style={{
              flex: 1, justifyContent: 'center', fontSize: 16,
              background: d === 'accept' ? 'var(--deal-soft)' : d === 'reject' ? 'var(--nodeal-soft)' : 'var(--surface-2)',
              color: d === 'accept' ? 'var(--deal)' : d === 'reject' ? 'var(--nodeal)' : 'var(--ink-3)',
            }}>
              {d && <Icon name={d === 'accept' ? 'check' : 'x'} size={18} />}
              {nameOf(x)} · {d === 'accept' ? 'accepts' : d === 'reject' ? 'rejects' : 'waiting'}
            </span>
          );
        })}
      </div>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
        <AnimatePresence>
          {view.verdict !== null && (
            <Stamp key={String(view.verdict)} text={view.verdict ? 'Deal' : 'No deal'} tone={view.verdict ? 'deal' : 'nodeal'} size={view.verdict ? 60 : 46} rotate={view.verdict ? -7 : -8} />
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function RogueHit({ fromLeft, text }: { fromLeft: boolean; text: string }) {
  const dir = fromLeft ? -1 : 1;
  return (
    <div style={{ position: 'absolute', top: 540, left: 0, right: 0, height: 0, zIndex: 8, pointerEvents: 'none' }}>
      <motion.div
        initial={{ x: dir * 620, opacity: 0 }}
        animate={{ x: [dir * 620, dir * 214, dir * 260, dir * 232], opacity: [0, 1, 1, 1], rotate: [0, 0, dir * 4, dir * 2] }}
        transition={{ duration: 0.75, times: [0, 0.5, 0.75, 1], ease: 'easeOut' }}
        className="card"
        style={{ position: 'absolute', left: '50%', translate: '-50% -50%', width: 300, padding: 'var(--s2)', fontSize: 19, fontWeight: 600, lineHeight: 1.3, border: '2px solid var(--nodeal)', boxShadow: 'var(--shadow-lg)' }}>
        <div className="eyebrow" style={{ fontSize: 12, color: 'var(--nodeal)', marginBottom: 4 }}>Free text · trying to cross</div>
        {text}
      </motion.div>
      <div style={{ position: 'absolute', left: '50%', top: 64, translate: '-50% 0', textAlign: 'center' }}>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.42 }}>
          <Stamp text="Blocked" tone="blocked" size={50} rotate={-6} style={{ display: 'inline-block' }} />
          <div className="pill" style={{ marginTop: 'var(--s2)', background: 'var(--nodeal)', color: 'var(--surface)', fontSize: 16 }}>
            free text not allowed
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export function TapeZone({ s, view, items, onSelect, selectedId, leftId }: {
  s: Snapshot; view: View; items: Placed[]; onSelect: (id: string, el: HTMLElement) => void; selectedId: string | null; leftId: string | undefined;
}) {
  const onTape = items.filter((p) => p.state !== 'box');
  const rogueText = view.rogue ? (view.rogueNotes[view.rogue.fromId ?? '']?.at(-1)?.note.match(/"(.*)"/)?.[1] ?? 'a free-text message') : '';
  return (
    <section aria-label="What crosses the line" style={{ position: 'relative', height: '100%' }}>
      <Tape split={view.split} />
      <motion.div animate={{ opacity: view.split ? 0 : 1 }} style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--s2)' }}>
        <div className="card" style={{ textAlign: 'center', padding: '14px var(--s3)' }}>
          <div className="serif" style={{ fontWeight: 600, fontSize: 30, lineHeight: 1.1, letterSpacing: '-0.01em' }}>
            What crosses <span style={{ fontStyle: 'italic', color: 'var(--accent)' }}>the line</span>
          </div>
          <div style={{ fontSize: 15, color: 'var(--ink-3)', marginTop: 4 }}>the only things these two ever say to each other</div>
        </div>

        {view.past.length > 0 && (
          <div style={{ display: 'flex', gap: 'var(--s1)', flexWrap: 'wrap', justifyContent: 'center' }}>
            {view.past.map((r) => (
              <span key={r.round} className="pill num" style={{
                height: 34, fontSize: 15, background: r.deal ? 'var(--deal-soft)' : 'var(--nodeal-soft)', color: r.deal ? 'var(--deal)' : 'var(--nodeal)',
              }}>
                <Icon name={r.deal ? 'check' : 'x'} size={16} /> Round {r.round} · {r.deal ? 'deal' : 'no deal'} · {money(r.totalCents)}
              </span>
            ))}
          </div>
        )}

        <AnimatePresence mode="popLayout">
          {view.current && !view.agreement && <ProposalCard key={view.current.id} s={s} view={view} />}
        </AnimatePresence>

        <motion.div layout style={{ display: 'grid', gridTemplateColumns: view.current ? 'repeat(3, 152px)' : 'repeat(2, 222px)', gap: view.current ? 'var(--s1)' : 'var(--s2)', zIndex: 3 }}>
          {onTape.map((p) => <ItemCard key={p.id} p={p} size={view.current ? 'mini' : 'tape'} onSelect={onSelect} selected={selectedId === p.id} />)}
        </motion.div>
        {!view.current && (
          <div className="serif" style={{ fontSize: 18, fontStyle: 'italic', color: 'var(--ink-2)', background: 'var(--surface)', padding: '6px 16px', borderRadius: 999, boxShadow: 'var(--shadow-sm)' }}>
            shared things, waiting to be divided
          </div>
        )}
      </motion.div>
      <AnimatePresence>
        {view.rogue && <RogueHit key={view.rogue.leak.id} fromLeft={view.rogue.fromId === leftId} text={rogueText} />}
      </AnimatePresence>
    </section>
  );
}
