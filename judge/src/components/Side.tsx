import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { money, nameOf, shortDate } from '../data/format.ts';
import type { View } from '../data/timeline.ts';
import type { Participant, Snapshot } from '../data/types.ts';
import { MovingBox, type Placed } from './Items.tsx';
import { Icon, IOU, Keys } from './pieces.tsx';

const BAR_WIDTHS = [96, 82, 90, 70, 88, 76, 94, 64, 86, 72];

/** Document-style redaction: charcoal bars and a small "Private" label. Declassify peels them off. */
export function Redacted({ on, bars = 6, children }: { on: boolean; bars?: number; children: ReactNode }) {
  return (
    // Fills the rest of its card. While redacted it clips, so the bars always fit the card exactly.
    <div style={{ position: 'relative', flex: 1, minHeight: on ? 0 : undefined, overflow: on ? 'hidden' : undefined }}>
      <div aria-hidden={on} style={{ visibility: on ? 'hidden' : 'visible' }}>{children}</div>
      <AnimatePresence>
        {on && (
          <motion.div key="redaction" exit={{ transition: { duration: 0.45 } }}
            style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', pointerEvents: 'none' }}>
            {Array.from({ length: bars }, (_, i) => (
              <motion.div key={i}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1, transition: { type: 'spring', stiffness: 420, damping: 36, delay: i * 0.03 } }}
                exit={{ scaleX: 0, transition: { duration: 0.28, delay: i * 0.035, ease: [0.6, 0, 0.8, 0.4] } }}
                style={{ height: 14, width: `${BAR_WIDTHS[i % BAR_WIDTHS.length]}%`, background: 'var(--redact)', borderRadius: 4, transformOrigin: i % 2 ? 'right' : 'left' }} />
            ))}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1, transition: { delay: 0.15 } }} exit={{ opacity: 0, transition: { duration: 0.12 } }}
              className="pill"
              style={{ position: 'absolute', top: '50%', left: '50%', translate: '-50% -50%', background: 'var(--surface)', color: 'var(--nodeal)', boxShadow: 'var(--shadow-md)', border: '1px solid var(--nodeal-soft)', fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 20, fontWeight: 600 }}>
              <Icon name="lock" size={18} /> Private
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Every side card fills its slot, so both sides line up exactly. */
const CARD = { padding: 'var(--s3)', height: '100%', display: 'flex', flexDirection: 'column' } as const;

function CardTitle({ children }: { children: ReactNode }) {
  return <div className="eyebrow" style={{ marginBottom: 'var(--s1)' }}>{children}</div>;
}

function Values({ s, p, redacted }: { s: Snapshot; p: Participant; redacted: boolean }) {
  const mine = s.valuations.filter((v) => v.participant_id === p.id);
  const v = (itemId: string, outcome: string) => mine.find((x) => x.item_id === itemId && x.outcome === outcome)?.value_cents;
  const rows = s.items.map((item) => {
    if (item.kind === 'pet') {
      return { label: item.name, value: money(v(item.id, 'full') ?? 0), sub: `${money(v(item.id, 'primary') ?? 0)} with visits · ${money(v(item.id, 'visits') ?? 0)} visiting` };
    }
    if (item.kind === 'lease') return { label: 'Staying put', value: money(v(item.id, 'keep') ?? 0) };
    if (item.kind === 'lease_break_fee') return { label: 'Taking the fee', value: money(v(item.id, 'pay') ?? -(item.amount_cents ?? 0)) };
    return { label: item.name, value: money(v(item.id, 'keep') ?? 0) };
  });
  return (
    <div className="card scroll" style={CARD}>
      <CardTitle>What it's worth to {nameOf(p)}</CardTitle>
      <Redacted on={redacted} bars={7}>
      {rows.map((r) => (
        <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--s1)', padding: '3px 0', borderBottom: '1px solid var(--line)' }}>
          <span style={{ color: 'var(--ink-2)', fontSize: 18 }}>
            {r.label}{r.sub && <span style={{ display: 'block', fontSize: 14, color: 'var(--ink-3)' }}>{r.sub}</span>}
          </span>
          <span className="num" style={{ fontWeight: 650, fontSize: 18 }}>{r.value}</span>
        </div>
      ))}
      </Redacted>
    </div>
  );
}

function Limits({ s, p, redacted }: { s: Snapshot; p: Participant; redacted: boolean }) {
  const ex = nameOf(s.participants.find((x) => x.id !== p.id));
  const rows = s.constraints.filter((c) => c.participant_id === p.id).map((c) => {
    const val = c.value as Record<string, unknown>;
    if (c.kind === 'max_payment_cents') return { icon: 'bolt', title: `Pays ${ex} at most`, text: money(Number(val.cents)), hard: true };
    if (c.kind === 'must_keep_item') return { icon: 'ban', title: 'Dealbreaker', text: `${s.items.find((i) => i.id === val.item_id)?.name ?? 'An item'} stays with ${nameOf(p)}`, hard: true };
    if (c.kind === 'move_out_window') return { icon: 'house', title: 'Move-out window', text: `${shortDate(String(val.earliest))} – ${shortDate(String(val.latest))}`, hard: false };
    return { icon: 'box', title: 'Other', text: String(val.text ?? ''), hard: false };
  }).sort((x, y) => Number(y.hard) - Number(x.hard));
  return (
    <div className="card scroll" style={CARD}>
      <CardTitle>Hard limits</CardTitle>
      <Redacted on={redacted} bars={5}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.length === 0 && <div style={{ color: 'var(--ink-3)', fontSize: 18 }}>None</div>}
      {rows.map((r) => (
        <div key={r.title + r.text} style={{
          display: 'flex', gap: 10, alignItems: 'center', padding: '6px 10px', borderRadius: 'var(--r-sm)',
          background: r.hard ? 'var(--nodeal-soft)' : 'var(--surface-2)',
        }}>
          <Icon name={r.icon} size={20} style={{ color: r.hard ? 'var(--nodeal)' : 'var(--ink-3)' }} />
          <span style={{ lineHeight: 1.2 }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: r.hard ? 'var(--nodeal)' : 'var(--ink-3)' }}>{r.title}</span>
            <span className="num" style={{ fontSize: 17, fontWeight: 650 }}>{r.text}</span>
          </span>
        </div>
      ))}
      </div>
      </Redacted>
    </div>
  );
}

function Monologue({ view, p, right, redacted }: { view: View; p: Participant; right: boolean; redacted: boolean }) {
  const notes = (view.notes[p.id] ?? []).slice(-1);
  const rogue = view.rogueNotes[p.id]?.at(-1);
  return (
    <div className="card scroll" style={CARD}>
      <CardTitle>Advocate's notes</CardTitle>
      <Redacted on={redacted} bars={3}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {notes.length === 0 && !rogue && <div style={{ color: 'var(--ink-3)', fontSize: 18, fontStyle: 'italic', fontFamily: 'var(--font-display)' }}>Nothing to decide yet.</div>}
        {rogue && (
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--nodeal)', display: 'flex', gap: 8, alignItems: 'center' }}>
            <Icon name="ban" size={18} /> Tried to ask: "{rogue.note.match(/"(.*)"/)?.[1] ?? '?'}"
          </div>
        )}
        <AnimatePresence initial={false}>
          {notes.map((n) => {
            const verdict = /\b(ACCEPT|REJECT)$/.exec(n.note)?.[1];
            const text = n.note.replace(/\s*(ACCEPT|REJECT)$/, '');
            return (
              <motion.div key={n.created_at + n.participant_id} initial={{ opacity: 0, x: right ? 20 : -20 }} animate={{ opacity: 1, x: 0 }}
                style={{ display: 'flex', gap: 12, alignItems: 'baseline', fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 19, lineHeight: 1.3, color: 'var(--ink)' }}>
                <span style={{ flex: 1 }}>“{text}”</span>
                {verdict && <span style={{ fontFamily: 'var(--font-sans)', fontStyle: 'normal', fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', color: verdict === 'ACCEPT' ? 'var(--deal)' : 'var(--nodeal)' }}>{verdict}</span>}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      </Redacted>
    </div>
  );
}

export function VerdictPill({ decision }: { decision: 'accept' | 'reject' }) {
  const ok = decision === 'accept';
  return (
    <motion.span initial={{ scale: 1.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.12 } }}
      transition={{ type: 'spring', stiffness: 600, damping: 24 }} className="pill"
      style={{ background: ok ? 'var(--deal)' : 'var(--nodeal)', color: 'var(--surface)', height: 44, fontSize: 18, letterSpacing: '0.06em' }}>
      <Icon name={ok ? 'check' : 'x'} size={20} /> {ok ? 'ACCEPT' : 'REJECT'}
    </motion.span>
  );
}

export function Side({ s, p, view, items, declassified, onSelect, selectedId, side, iou, keys }: {
  s: Snapshot; p: Participant; view: View; items: Placed[]; declassified: boolean;
  onSelect: (id: string, el: HTMLElement) => void; selectedId: string | null; side: 'left' | 'right';
  iou: Parameters<typeof IOU>[0] | null; keys: boolean;
}) {
  const decision = view.current ? view.decisions[p.id] : undefined;
  const thinking = !!view.current && !decision && view.verdict === null;
  const right = side === 'right';
  const ring = decision === 'accept' ? 'var(--deal)' : decision === 'reject' ? 'var(--nodeal)' : 'transparent';

  return (
    <motion.section aria-label={`${nameOf(p)}'s side`}
      animate={{ borderColor: ring, backgroundColor: decision ? (decision === 'accept' ? 'rgba(225,235,223,.45)' : 'rgba(246,221,215,.45)') : 'rgba(255,252,247,0)' }}
      transition={{ duration: 0.3 }}
      style={{ height: '100%', borderRadius: 32, border: '2px solid transparent', padding: 'var(--s2)', margin: 'calc(-1 * var(--s2))', display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexDirection: right ? 'row-reverse' : 'row', height: 56 }}>
        <div style={{ textAlign: right ? 'right' : 'left' }}>
          <div className="serif" style={{ fontWeight: 600, fontSize: 44, lineHeight: 1, letterSpacing: '-0.02em' }}>
            {nameOf(p)}<span style={{ fontStyle: 'italic', fontWeight: 400, color: 'var(--ink-3)' }}>'s side</span>
          </div>
          <div style={{ fontSize: 16, color: 'var(--ink-3)', marginTop: 6, display: 'flex', gap: 6, alignItems: 'center', justifyContent: right ? 'flex-end' : 'flex-start' }}>
            <Icon name="lock" size={16} /> {nameOf(p)}'s advocate sees only {nameOf(p)}'s data
          </div>
        </div>
        <AnimatePresence mode="wait">
          {decision && <VerdictPill key={decision} decision={decision} />}
          {thinking && (
            // The exit needs its own transition: inheriting the infinite pulse would never finish,
            // and mode="wait" would hold the ACCEPT / REJECT pill back forever.
            <motion.span key="thinking" className="pill" initial={{ opacity: 0 }} animate={{ opacity: [0.5, 1, 0.5] }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={{ repeat: Infinity, duration: 1.4 }}
              style={{ background: 'var(--surface)', color: 'var(--ink-2)', boxShadow: 'var(--shadow-sm)', fontStyle: 'italic', fontFamily: 'var(--font-display)', fontWeight: 500 }}>
              deciding…
            </motion.span>
          )}
        </AnimatePresence>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 'var(--s2)', height: 244 }}>
        <Values s={s} p={p} redacted={!declassified} />
        <Limits s={s} p={p} redacted={!declassified} />
      </div>

      <div style={{ height: 176 }}><Monologue view={view} p={p} right={right} redacted={!declassified} /></div>

      <div>
        <MovingBox owner={nameOf(p)} items={items} taped={view.split} onSelect={onSelect} selectedId={selectedId} flip={right}>
          {(iou || keys) && (
            <div style={{ position: 'absolute', top: 44, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 'var(--s3)', alignItems: 'center', zIndex: 10 }}>
              {keys && <Keys layoutId="keys" size={64} />}
              {iou && <IOU {...iou} layoutId="iou" compact />}
            </div>
          )}
        </MovingBox>
      </div>
    </motion.section>
  );
}
