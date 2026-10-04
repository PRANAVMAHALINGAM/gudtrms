import { AnimatePresence, motion } from 'framer-motion';
import { money, nameOf, shortDate } from '../data/format.ts';
import type { View } from '../data/timeline.ts';
import type { Snapshot } from '../data/types.ts';
import { Icon, itemIcon } from './pieces.tsx';

export interface Placed {
  id: string;
  name: string;
  kind: string;
  /** Whose box it's in, or null if it sits on the tape. */
  to: string | null;
  state: 'tape' | 'box' | 'cancelled' | 'both-out' | 'unused';
  tag?: string;
}

const DEPOSIT_ID = 'deposit';

/** Where every shared item (plus the deposit) sits at this point in the negotiation. */
export function placeItems(s: Snapshot, view: View): Placed[] {
  const who = (id: string | null) => nameOf(s.participants.find((p) => p.id === id));
  const alloc = view.assigned ? view.current?.allocation : undefined;
  const lease = s.items.find((i) => i.kind === 'lease');
  const leaseTo = lease && alloc ? alloc[lease.id]?.to ?? null : undefined;
  const out: Placed[] = [];

  for (const item of s.items) {
    const base = { id: item.id, name: item.name, kind: item.kind };
    const slot = alloc?.[item.id];
    if (!alloc) {
      out.push({ ...base, to: null, state: 'tape', tag: item.kind === 'lease_break_fee' && item.amount_cents ? `${money(item.amount_cents)} fee` : undefined });
      continue;
    }
    switch (item.kind) {
      case 'subscription':
        out.push(slot?.to ? { ...base, to: slot.to, state: 'box', tag: 'takes over billing' } : { ...base, to: null, state: 'cancelled', tag: 'cancelled' });
        break;
      case 'lease':
        out.push(slot?.to
          ? { ...base, to: slot.to, state: 'box', tag: `stays · ${who(otherOf(s, slot.to))} out by ${shortDate(view.current!.move_out_date)}` }
          : { ...base, to: null, state: 'both-out', tag: `both out by ${shortDate(view.current!.move_out_date)}` });
        break;
      case 'pet':
        out.push({ ...base, to: slot?.to ?? null, state: slot?.to ? 'box' : 'tape', tag: slot?.weekends ? `${who(slot.weekends)} every other weekend` : 'full-time' });
        break;
      case 'lease_break_fee':
        out.push(slot?.to
          ? { ...base, to: slot.to, state: 'box', tag: `pays the ${money(item.amount_cents ?? 0)} fee` }
          : { ...base, to: null, state: 'unused', tag: 'no fee: someone stays' });
        break;
      default:
        out.push({ ...base, to: slot?.to ?? null, state: slot?.to ? 'box' : 'tape' });
    }
  }

  const total = s.deposits.reduce((t, d) => t + d.amount_cents, 0);
  if (total > 0) {
    // Short labels: the amount lives in the tag so the name fits on one line in a box.
    const base = { id: DEPOSIT_ID, name: 'Deposit', kind: 'deposit' };
    const split = view.current?.transfer.deposit_split;
    if (leaseTo) out.push({ ...base, to: leaseTo, state: 'box', tag: `${money(total)} · on ${who(leaseTo)}'s lease` });
    else if (leaseTo === null && split) {
      const pct = s.participants.map((p) => `${Math.round((split[p.id] ?? 0) * 100)}`).join('/');
      out.push({ ...base, to: null, state: 'tape', tag: `${money(total)} · split ${pct}` });
    } else out.push({ ...base, to: null, state: 'tape', tag: `${money(total)} · paid together` });
  }
  return out;
}

const otherOf = (s: Snapshot, id: string) => s.participants.find((p) => p.id !== id)?.id ?? null;

/** A barely-there tilt so a pile of cards feels hand-placed, not gridded. */
const tilt = (id: string) => ((id.split('').reduce((h, c) => h + c.charCodeAt(0), 0) % 5) - 2) * 0.5;

const ICON_TINT: Record<string, string> = {
  lease: 'var(--accent-soft)', pet: 'var(--deal-soft)', deposit: '#f3ead2', subscription: '#ece6f1', lease_break_fee: 'var(--nodeal-soft)',
};

/** tape: roomy (intake) · box: in a moving box · mini: three across on the tape while a proposal shows */
const SIZES = {
  tape: { w: 222, h: 76, pad: '12px 14px', icon: 44, glyph: 24, name: 19, tag: 15 },
  box: { w: 170, h: 52, pad: '6px 10px', icon: 32, glyph: 20, name: 17, tag: 14 },
  mini: { w: 152, h: 52, pad: '6px 10px', icon: 28, glyph: 18, name: 16, tag: 13 },
} as const;

export function ItemCard({ p, size, onSelect, selected, width }: {
  p: Placed; size: keyof typeof SIZES; onSelect: (id: string, el: HTMLElement) => void; selected: boolean; width?: number;
}) {
  const dim = p.state === 'cancelled' || p.state === 'unused';
  const z = SIZES[size];
  // In a box, name and tag get one line each so a card can't outgrow its slot. Elsewhere, up to two lines.
  const clamp = size !== 'box'
    ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }
    : { display: 'block', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' };
  return (
    <motion.button
      layoutId={`item-${p.id}`}
      onClick={(e) => onSelect(p.id, e.currentTarget)}
      initial={false}
      animate={{ rotate: size === 'box' ? 0 : tilt(p.id), opacity: dim ? 0.6 : 1 }}
      whileHover={{ y: -3, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30, mass: 0.8 }}
      aria-label={`${p.name}${p.tag ? `, ${p.tag}` : ''}. Show details`}
      title={`${p.name}${p.tag ? ` · ${p.tag}` : ''}`}
      style={{
        display: 'flex', alignItems: 'center', gap: size === 'mini' ? 8 : 12, width: width ?? z.w, minHeight: z.h,
        padding: z.pad, background: 'var(--surface)', color: 'var(--ink)', textAlign: 'left',
        border: `2px solid ${selected ? 'var(--accent)' : 'transparent'}`, borderRadius: 'var(--r-md)', cursor: 'pointer',
        boxShadow: selected ? 'var(--shadow-md)' : 'var(--shadow-sm)', position: 'relative', zIndex: selected ? 5 : 1,
      }}
    >
      <span style={{
        display: 'grid', placeItems: 'center', width: z.icon, height: z.icon, borderRadius: size === 'tape' ? 12 : 10,
        background: ICON_TINT[p.kind] ?? 'var(--surface-2)', color: 'var(--ink-2)', flex: 'none',
      }}>
        <Icon name={itemIcon(p.kind, p.name)} size={z.glyph} />
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ ...clamp, fontWeight: 650, fontSize: z.name, lineHeight: 1.2, textDecoration: p.state === 'cancelled' ? 'line-through' : undefined }}>
          {p.name}
        </span>
        {p.tag && <span style={{ ...clamp, fontSize: z.tag, color: 'var(--ink-3)', fontWeight: 500, lineHeight: 1.25, marginTop: 2 }}>{p.tag}</span>}
      </span>
    </motion.button>
  );
}

export function MovingBox({ owner, items, taped, onSelect, selectedId, flip, children }: {
  owner: string; items: Placed[]; taped: boolean; onSelect: (id: string, el: HTMLElement) => void; selectedId: string | null;
  flip?: boolean; children?: React.ReactNode;
}) {
  return (
    <div style={{ position: 'relative', height: 220 }}>
      {/* open flaps */}
      <motion.div animate={{ rotateX: taped ? 0 : 55, opacity: taped ? 0 : 1 }} transition={{ duration: 0.5 }}
        style={{ position: 'absolute', left: 24, right: 24, top: 0, height: 32, transformOrigin: 'bottom', background: 'var(--kraft-dark)', clipPath: 'polygon(3% 100%, 0 0, 100% 0, 97% 100%)', borderRadius: '6px 6px 0 0' }} />
      <div style={{
        position: 'absolute', inset: '24px 0 0 0', borderRadius: 'var(--r-lg)', background: 'var(--kraft)',
        backgroundImage: 'repeating-linear-gradient(90deg, rgba(120,84,40,.05) 0 2px, transparent 2px 10px)',
        boxShadow: 'inset 0 -10px 0 var(--kraft-dark), var(--shadow-sm)', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', inset: '10px 12px 54px', borderRadius: 'var(--r-md)', background: 'var(--kraft-deep)', boxShadow: 'inset 0 6px 14px rgba(72,48,28,.35)' }} />
        {/* Exactly two rows of box cards fit (2 x 56px with borders + 8px gap = 120px). Past that (lots of items in a live case) the box scrolls rather than spilling. */}
        <div className={items.length > 6 ? 'scroll' : undefined} style={{ position: 'absolute', inset: '16px 20px 60px', display: 'flex', flexWrap: 'wrap', gap: 'var(--s1)', alignContent: 'flex-start', justifyContent: flip ? 'flex-end' : 'flex-start' }}>
          {/* Up to 4 items: two wide cards per row, so names show in full. More: three narrower ones per row. */}
          {items.map((p) => <ItemCard key={p.id} p={p} size="box" width={items.length <= 4 ? 290 : 190} onSelect={onSelect} selected={selectedId === p.id} />)}
          {items.length === 0 && !taped && (
            <span style={{ color: '#f6ead9', fontSize: 17, fontWeight: 500, fontStyle: 'italic', alignSelf: 'center', margin: '0 auto', fontFamily: 'var(--font-display)' }}>empty for now</span>
          )}
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 8, zIndex: 9, textAlign: 'center', fontFamily: 'var(--font-hand)', fontWeight: 700, fontSize: 38, lineHeight: 1, color: 'var(--ink)', rotate: '-1deg' }}>
          {owner}{taped ? "'s stuff" : ''}
        </div>
        <AnimatePresence>
          {taped && (
            <>
              <motion.div key="lid" initial={{ y: '-100%' }} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 26 }}
                style={{ position: 'absolute', inset: '0 0 56px', background: 'var(--kraft)', borderBottom: '2px solid var(--kraft-dark)', zIndex: 7 }} />
              <motion.div key="tape" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.35, duration: 0.45, ease: [0.2, 0.9, 0.2, 1] }}
                style={{ position: 'absolute', left: -10, right: -10, top: '32%', height: 40, background: 'var(--tape)', opacity: 0.95, transformOrigin: flip ? 'right' : 'left', rotate: '-1deg', zIndex: 8, boxShadow: '0 1px 2px rgba(72,48,28,.15)' }} />
            </>
          )}
        </AnimatePresence>
      </div>
      {children}
    </div>
  );
}
