import { motion } from 'framer-motion';
import { money, nameOf } from '../data/format.ts';
import { fairness, type Step, type View } from '../data/timeline.ts';
import type { Mode, Snapshot } from '../data/types.ts';
import { Icon } from './pieces.tsx';

const ROUND_CAP = 5;

/* ---------- Header ---------- */

export function Header({ s, view, mode, onMode, declassified, onDeclassify, muted, onMute, onHelp, liveError }: {
  s: Snapshot; view: View; mode: Mode; onMode: (m: Mode) => void; declassified: boolean; onDeclassify: () => void;
  muted: boolean; onMute: () => void; onHelp: () => void; liveError: string | null;
}) {
  const round = view.current?.round ?? 0;
  const status = {
    Intake: { bg: 'var(--surface)', fg: 'var(--ink-2)' },
    Negotiating: { bg: 'var(--accent-soft)', fg: 'var(--accent)' },
    Agreed: { bg: 'var(--deal-soft)', fg: 'var(--deal)' },
    Parted: { bg: 'var(--deal)', fg: 'var(--surface)' },
    Stuck: { bg: 'var(--nodeal-soft)', fg: 'var(--nodeal)' },
  }[view.status];
  return (
    <header style={{ height: 'var(--header-h)', display: 'flex', alignItems: 'center', gap: 'var(--s3)', padding: '0 var(--s5)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s2)' }}>
        <span className="serif" style={{ fontWeight: 600, fontSize: 52, letterSpacing: '-0.035em', lineHeight: 1 }}>
          gud<span style={{ fontStyle: 'italic', fontWeight: 400, color: 'var(--accent)' }}>trms</span>
        </span>
        <span className="eyebrow">judge view</span>
      </div>
      <span style={{ width: 1, height: 36, background: 'var(--line-strong)' }} />
      <span className="pill num" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-sm)' }}>Case {s.case?.code ?? '—'}</span>
      <motion.span key={view.status} className="pill" initial={{ scale: 1.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 26 }}
        style={{ background: status.bg, color: status.fg, boxShadow: 'var(--shadow-sm)', letterSpacing: '0.04em' }}>
        {view.status}
      </motion.span>
      <div aria-label={`Round ${round} of ${ROUND_CAP}`} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="num" style={{ fontSize: 18, fontWeight: 600 }}>Round {round || '–'} <span style={{ color: 'var(--ink-3)', fontWeight: 500 }}>of {ROUND_CAP}</span></span>
        <div style={{ display: 'flex', gap: 6 }}>
          {Array.from({ length: ROUND_CAP }, (_, i) => {
            const past = view.past.find((r) => r.round === i + 1);
            const now = round === i + 1;
            const bg = past ? (past.deal ? 'var(--deal)' : 'var(--nodeal)') : now ? 'var(--accent)' : 'var(--line-strong)';
            return <motion.span key={i} animate={{ scale: now ? 1.3 : 1 }} style={{ width: 10, height: 10, borderRadius: 99, background: bg }} />;
          })}
        </div>
      </div>

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
        <div role="group" aria-label="Data source" style={{ display: 'flex', padding: 4, background: 'var(--surface)', borderRadius: 999, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--line)' }}>
          {(['mock', 'live'] as const).map((m) => (
            <button key={m} onClick={() => onMode(m)} aria-pressed={mode === m}
              style={{ height: 40, padding: '0 18px', border: 0, borderRadius: 999, cursor: 'pointer', fontWeight: 600, fontSize: 16, background: mode === m ? 'var(--ink)' : 'transparent', color: mode === m ? 'var(--surface)' : 'var(--ink-2)' }}>
              {m === 'mock' ? 'Mock' : 'Live'}{m === 'live' && mode === 'live' && (liveError ? ' · offline' : ' ·  on')}
            </button>
          ))}
        </div>
        <button className="btn" onClick={onMute} aria-label={muted ? 'Unmute' : 'Mute'}><Icon name={muted ? 'mute' : 'sound'} size={20} /> <span className="kbd">M</span></button>
        <button className="btn" onClick={onHelp} aria-label="Keyboard shortcuts"><span className="kbd">?</span></button>
        <motion.button className="btn primary" onClick={onDeclassify} whileTap={{ scale: 0.95 }} style={{ height: 56, padding: '0 26px', fontSize: 18 }}>
          <Icon name={declassified ? 'lock' : 'eye'} size={22} /> {declassified ? 'Redact' : 'Declassify'} <span className="kbd">X</span>
        </motion.button>
      </div>
    </header>
  );
}

/* ---------- Timeline ---------- */

export function stepLabel(s: Snapshot, st: Step | undefined): string {
  const who = (id: string | null | undefined) => nameOf(s.participants.find((p) => p.id === id));
  switch (st?.kind) {
    case 'intake': return 'Intake done · shared things on the line';
    case 'proposal': return `Round ${st.round} · the mediator proposes`;
    case 'rogue': return `${who(st.fromId)}'s advocate tries to send free text · blocked`;
    case 'decision': return `${who(st.participantId)} ${st.decision === 'accept' ? 'accepts' : 'rejects'}`;
    case 'verdict': return `Round ${st.round} · ${st.deal ? 'deal' : 'no deal'}`;
    case 'agreement': return 'The agreement goes out to both';
    case 'sign': return `${who(st.participantId)} replies YES`;
    case 'split': return 'Parted on gudtrms';
    default: return '';
  }
}

function marker(st: Step): { color: string; icon?: string; label?: string; big?: boolean } {
  switch (st.kind) {
    case 'proposal': return { color: 'var(--ink)', label: `R${st.round}`, big: true };
    case 'decision': return { color: st.decision === 'accept' ? 'var(--deal)' : 'var(--nodeal)', icon: st.decision === 'accept' ? 'check' : 'x' };
    case 'verdict': return { color: st.deal ? 'var(--deal)' : 'var(--nodeal)', label: st.deal ? 'Deal' : 'No', big: true };
    case 'rogue': return { color: 'var(--nodeal)', icon: 'ban' };
    case 'agreement': return { color: 'var(--accent)', icon: 'receipt' };
    case 'sign': return { color: 'var(--deal)', icon: 'check' };
    case 'split': return { color: 'var(--accent)', icon: 'bolt', big: true };
    default: return { color: 'var(--kraft-dark)', icon: 'box' };
  }
}

export function Timeline({ s, steps, cursor, playing, speed, onSeek, onToggle, onReplay, onSpeed }: {
  s: Snapshot; steps: Step[]; cursor: number; playing: boolean; speed: 1 | 2;
  onSeek: (i: number) => void; onToggle: () => void; onReplay: () => void; onSpeed: (x: 1 | 2) => void;
}) {
  const last = Math.max(steps.length - 1, 1);
  const pct = (i: number) => `${(i / last) * 100}%`;
  return (
    <div className="card" style={{ flex: 1, minWidth: 0, padding: '20px var(--s3)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn" onClick={onReplay} aria-label="Replay"><Icon name="replay" size={20} /> <span className="kbd">R</span></button>
        <button className="btn primary" onClick={onToggle} aria-label={playing ? 'Pause' : 'Play'} style={{ width: 116 }}>
          <Icon name={playing ? 'pause' : 'play2'} size={20} /> {playing ? 'Pause' : 'Play'}
        </button>
        <div role="group" aria-label="Speed" style={{ display: 'flex', gap: 6 }}>
          {([1, 2] as const).map((x) => (
            <button key={x} className={`btn${speed === x ? ' on' : ''}`} onClick={() => onSpeed(x)} aria-pressed={speed === x} style={{ width: 56, padding: 0 }}>{x}x</button>
          ))}
        </div>
        <motion.div key={cursor} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          style={{ marginLeft: 'var(--s1)', fontSize: 20, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <span className="num" style={{ color: 'var(--ink-3)', fontWeight: 500 }}>{cursor + 1} / {steps.length}</span>
          <span className="serif" style={{ fontStyle: 'italic', fontWeight: 500, marginLeft: 12 }}>{stepLabel(s, steps[cursor])}</span>
        </motion.div>
      </div>
      <div style={{ position: 'relative', height: 48, margin: '0 20px' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 22, height: 4, borderRadius: 4, background: 'var(--line)' }} />
        <motion.div animate={{ width: pct(cursor) }} transition={{ type: 'spring', stiffness: 300, damping: 34 }}
          style={{ position: 'absolute', left: 0, top: 22, height: 4, borderRadius: 4, background: 'var(--accent)' }} />
        {steps.map((st, i) => {
          const m = marker(st);
          const done = i <= cursor;
          return (
            <button key={i} onClick={() => onSeek(i)} aria-label={`Step ${i + 1}: ${stepLabel(s, st)}`} title={stepLabel(s, st)}
              style={{
                position: 'absolute', left: pct(i), top: m.big ? 8 : 12, translate: '-50% 0', height: m.big ? 32 : 24, minWidth: m.big ? 32 : 24,
                padding: m.label ? '0 10px' : 0, borderRadius: 999, border: i === cursor ? '2px solid var(--ink)' : '2px solid var(--surface)',
                background: done ? m.color : 'var(--surface-2)', color: done ? 'var(--surface)' : 'var(--ink-3)', display: 'grid', placeItems: 'center',
                cursor: 'pointer', fontSize: 13, fontWeight: 700, zIndex: i === cursor ? 2 : 1, boxShadow: 'var(--shadow-sm)',
              }}>
              {m.label ?? (m.icon && <Icon name={m.icon} size={14} />)}
            </button>
          );
        })}
        <input type="range" min={0} max={steps.length - 1} value={cursor} onChange={(e) => onSeek(Number(e.target.value))}
          aria-label="Scrub the negotiation"
          style={{ position: 'absolute', left: -20, top: 0, width: 'calc(100% + 40px)', height: 48, opacity: 0, cursor: 'grab', zIndex: 0 }} />
      </div>
    </div>
  );
}

/* ---------- Is it fair? (compact) ---------- */

export function MathCompact({ s, view, onOpen }: { s: Snapshot; view: View; onOpen: () => void }) {
  const p = view.agreement ?? view.current;
  const f = p ? fairness(s, p) : null;
  return (
    <motion.button onClick={onOpen} whileHover={{ y: -3 }} aria-label="Is it fair? Open the math breakdown" className="card scroll"
      style={{ width: 400, textAlign: 'left', cursor: 'pointer', padding: '18px var(--s3)', display: 'flex', flexDirection: 'column', gap: 2, font: 'inherit', color: 'inherit' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="serif" style={{ fontWeight: 600, fontSize: 24 }}>Is it <span style={{ fontStyle: 'italic', color: 'var(--accent)' }}>fair?</span></span>
        <span className="eyebrow" style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>open <span className="kbd">F</span></span>
      </div>
      {f ? (
        <>
          {f.rows.map((r) => (
            <div key={r.participant.id} className="num" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, lineHeight: 1.4 }}>
              <span style={{ color: 'var(--ink-2)' }}>{nameOf(r.participant)} · fair share {money(r.fair)}</span>
              <span style={{ fontWeight: 700, color: 'var(--deal)' }}>+{money(r.final - r.fair)}</span>
            </div>
          ))}
          <div className="num" style={{ fontSize: 14, color: 'var(--ink-3)', lineHeight: 1.35 }}>
            Surplus {money(f.surplus)}, split evenly{p!.transfer.deposit_cents !== 0 ? ` · deposit ${money(Math.abs(p!.transfer.deposit_cents))} separate` : ''}
          </div>
        </>
      ) : <div style={{ fontSize: 17, color: 'var(--ink-3)' }}>Numbers appear with the first proposal.</div>}
    </motion.button>
  );
}

/* ---------- Leak log ---------- */

export function LeakLog({ s, view }: { s: Snapshot; view: View }) {
  const name = (reason: string) => reason.replace(/\(from (A|B)'s advocate\)/, (_, r) => `(from ${nameOf(s.participants.find((p) => p.role === r))}'s advocate)`);
  return (
    <div aria-label="Leak log" className="card scroll" style={{ width: 400, padding: '20px var(--s3)', borderColor: view.leaks.length ? 'var(--nodeal-soft)' : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--s1)' }}>
        <span className="serif" style={{ fontWeight: 600, fontSize: 24 }}>Leak <span style={{ fontStyle: 'italic', color: 'var(--accent)' }}>log</span></span>
        <span className="pill num" style={{ height: 30, fontSize: 14, background: view.leaks.length ? 'var(--nodeal-soft)' : 'var(--surface-2)', color: view.leaks.length ? 'var(--nodeal)' : 'var(--ink-3)' }}>
          {view.leaks.length} blocked
        </span>
      </div>
      {view.leaks.length === 0 && <div style={{ fontSize: 17, color: 'var(--ink-3)' }}>Nothing tried to cross that shouldn't.</div>}
      {[...view.leaks].reverse().map((l) => (
        <motion.div key={l.id} initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
          style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 16, fontWeight: 600, color: 'var(--nodeal)', padding: '4px 0', lineHeight: 1.3 }}>
          <Icon name="ban" size={18} style={{ marginTop: 2 }} />
          <span>{name(l.reason)} <span className="num" style={{ color: 'var(--ink-3)', fontWeight: 500 }}>{l.created_at.slice(11, 19)}</span></span>
        </motion.div>
      ))}
    </div>
  );
}
