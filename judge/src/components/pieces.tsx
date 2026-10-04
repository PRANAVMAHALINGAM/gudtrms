import { animate, motion, useMotionValue } from 'framer-motion';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { money } from '../data/format.ts';

/* ---------- Icons (inline SVG, 24px grid, stroke = currentColor) ---------- */

const paths: Record<string, ReactNode> = {
  house: <><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></>,
  couch: <><path d="M4 11V8a2 2 0 012-2h12a2 2 0 012 2v3" /><path d="M2 13a2 2 0 014 0v2h12v-2a2 2 0 014 0v5H2z" /><path d="M5 18v2M19 18v2" /></>,
  tv: <><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 21h8M12 17v4" /></>,
  paw: <><circle cx="7" cy="10" r="1.8" /><circle cx="11" cy="6.5" r="1.8" /><circle cx="15.5" cy="7.5" r="1.8" /><circle cx="18" cy="11.5" r="1.8" /><path d="M8.5 17.5c0-2.5 2-4.5 4-4.5s4 2 4 4.5c0 1.6-1.4 2.5-4 2.5s-4-.9-4-2.5z" /></>,
  play: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M10 9l5 3-5 3z" /></>,
  coins: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>,
  box: <><path d="M3 8l9-5 9 5v8l-9 5-9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  ban: <><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></>,
  play2: <path d="M7 5l12 7-12 7z" />,
  pause: <path d="M7 5v14M17 5v14" />,
  replay: <><path d="M4 12a8 8 0 108-8H7" /><path d="M9 1L6 4l3 3" /></>,
  sound: <><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M16 9a4 4 0 010 6M18.5 6.5a7.5 7.5 0 010 11" /></>,
  mute: <><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M17 9l5 6M22 9l-5 6" /></>,
  key: <><circle cx="7.5" cy="15.5" r="4.5" /><path d="M10.7 12.3L20 3M16 7l3 3M14 9l2 2" /></>,
  scale: <><path d="M12 3v18M5 21h14M6 7h12" /><path d="M6 7l-3 6a3 3 0 006 0zM18 7l-3 6a3 3 0 006 0z" /></>,
  bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
};

export function Icon({ name, size = 24, style }: { name: keyof typeof paths | string; size?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none', ...style }}>
      {paths[name] ?? paths.box}
    </svg>
  );
}

export function itemIcon(kind: string, name: string): string {
  const n = name.toLowerCase();
  if (kind === 'lease') return 'house';
  if (kind === 'pet') return 'paw';
  if (kind === 'subscription') return 'play';
  if (kind === 'deposit') return 'coins';
  if (kind === 'lease_break_fee') return 'receipt';
  if (/couch|sofa/.test(n)) return 'couch';
  if (/\btv\b|television/.test(n)) return 'tv';
  return 'box';
}

/* ---------- Rubber stamp ---------- */

/** A seal-style stamp: serif small caps inside a double rule. Slams in with a spring. */
export function Stamp({ text, tone, size = 72, rotate = -8, style }: {
  text: string; tone: 'deal' | 'nodeal' | 'blocked'; size?: number; rotate?: number; style?: CSSProperties;
}) {
  const color = tone === 'deal' ? 'var(--deal)' : 'var(--nodeal)';
  return (
    <motion.div
      initial={{ scale: 2.2, opacity: 0, rotate: rotate - 6 }}
      animate={{ scale: 1, opacity: 1, rotate }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 640, damping: 24, mass: 0.9 }}
      style={{
        fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: size, lineHeight: 1, letterSpacing: '0.12em',
        color, padding: `${size * 0.16}px ${size * 0.34}px`, borderRadius: size * 0.18, textTransform: 'uppercase',
        border: `${Math.max(3, size * 0.05)}px solid ${color}`, outline: `2px solid ${color}`, outlineOffset: Math.max(4, size * 0.07),
        background: 'rgba(255, 252, 247, 0.92)', whiteSpace: 'nowrap', pointerEvents: 'none', boxShadow: 'var(--shadow-md)',
        ...style,
      }}
    >
      {text}
    </motion.div>
  );
}

/* ---------- Money ticker ---------- */

export function Ticker({ cents, style }: { cents: number; style?: CSSProperties }) {
  const mv = useMotionValue(0);
  const [text, setText] = useState(money(0));
  useEffect(() => {
    const unsub = mv.on('change', (v) => setText(money(Math.round(v / 100) * 100)));
    const c = animate(mv, cents, {
      duration: 0.7, ease: [0.16, 1, 0.3, 1],
      onComplete: () => setText(money(cents)), // land on the exact amount, cents included
    });
    return () => { c.stop(); unsub(); };
  }, [cents, mv]);
  return <span className="num" style={style}>{text}</span>;
}

/* ---------- IOU ---------- */

export function IOU({ from, to, totalCents, buyoutCents, depositCents, layoutId, compact = false }: {
  from: string; to: string; totalCents: number; buyoutCents: number; depositCents: number; layoutId?: string; compact?: boolean;
}) {
  return (
    <motion.div
      layoutId={layoutId}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      style={{
        position: 'relative', background: '#fffdf8', color: 'var(--ink)', borderRadius: 6,
        padding: compact ? '12px 20px 14px' : '18px 28px 20px', boxShadow: 'var(--shadow-md)', rotate: -1.5,
        backgroundImage: 'repeating-linear-gradient(transparent 0 33px, rgba(160, 80, 58, 0.12) 33px 34px)',
        fontFamily: 'var(--font-hand)', minWidth: compact ? 280 : 360,
      }}
    >
      <div style={{ position: 'absolute', top: -12, left: '50%', translate: '-50% 0', width: 84, height: 24, background: 'var(--tape)', opacity: 0.95, rotate: '3deg', boxShadow: '0 1px 2px rgba(72,48,28,.12)' }} />
      <div style={{ fontSize: compact ? 28 : 36, fontWeight: 700, lineHeight: 1, color: 'var(--accent)' }}>IOU</div>
      <div style={{ fontSize: compact ? 30 : 40, lineHeight: 1.15 }}>
        {from} owes {to} <span style={{ fontWeight: 700 }}><Ticker cents={totalCents} /></span>
      </div>
      {(depositCents !== 0) && (
        <div style={{ fontSize: compact ? 22 : 26, color: 'var(--ink-2)' }}>
          {money(buyoutCents)} buyout + {money(depositCents)} deposit share
        </div>
      )}
    </motion.div>
  );
}

/* ---------- Keys ---------- */

export function Keys({ layoutId, size = 64 }: { layoutId?: string; size?: number }) {
  return (
    <motion.div layoutId={layoutId} transition={{ type: 'spring', stiffness: 180, damping: 18 }}
      style={{ color: 'var(--gold)', filter: 'drop-shadow(0 4px 8px rgba(72,48,28,.25))', display: 'inline-flex' }}>
      <Icon name="key" size={size} />
    </motion.div>
  );
}
