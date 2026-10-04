import { AnimatePresence, motion } from 'framer-motion';
import { useState, type ReactNode } from 'react';
import { candidates, type MoveOutWindow } from '../../../src/engine/mediator.ts';
import { valueLookup } from '../../../src/engine/values.ts';
import { demoConstraints, demoDeposits, demoItems } from '../../../src/shared/demoScenario.ts';
import type { Valuation } from '../../../src/shared/types.ts';
import { money, nameOf, shortDate } from '../data/format.ts';
import { asItems, fairness, roles, type View } from '../data/timeline.ts';
import type { ProposalRow, Snapshot } from '../data/types.ts';
import { Icon, IOU, Keys, Ticker } from './pieces.tsx';

/* ---------- Agreement + the split ---------- */

export function agreementTerms(s: Snapshot, p: ProposalRow): string[] {
  if (s.agreement?.text?.trim()) {
    return s.agreement.text.split('\n').map((l) => l.replace(/^[-•]\s*/, '').trim())
      .filter((l) => l && !/^reply yes/i.test(l) && !/^gudtrms agreement/i.test(l));
  }
  const who = (id: string | null) => nameOf(s.participants.find((x) => x.id === id));
  const other = (id: string | null) => s.participants.find((x) => x.id !== id)?.id ?? null;
  const out: string[] = [];
  const t = p.transfer;
  const lease = s.items.find((i) => i.kind === 'lease');
  const stays = lease ? p.allocation[lease.id]?.to ?? null : undefined;
  if (stays) out.push(`${who(stays)} keeps the apartment and the lease. ${who(other(stays))} moves out by ${shortDate(p.move_out_date)}.`);
  else if (stays === null) out.push(`You both move out by ${shortDate(p.move_out_date)}.`);
  const fee = s.items.find((i) => i.kind === 'lease_break_fee');
  if (fee && p.allocation[fee.id]?.to) out.push(`${who(p.allocation[fee.id]!.to)} pays the landlord the ${money(fee.amount_cents ?? 0)} lease-break fee.`);
  if (t.buyout_cents !== 0 && t.from) {
    const payer = t.buyout_cents > 0 ? t.from : t.to;
    out.push(`${who(payer)} pays ${who(other(payer))} ${money(Math.abs(t.buyout_cents))} as a buyout.`);
  }
  if (stays && t.deposit_cents !== 0) {
    out.push(`The deposit stays with the landlord under ${who(stays)}'s lease, so ${who(stays)} pays ${who(other(stays))} back their ${money(Math.abs(t.deposit_cents))} share.`);
  } else if (t.deposit_split) {
    const parts = s.participants.map((x) => `${who(x.id)} gets ${Math.round((t.deposit_split![x.id] ?? 0) * 100)}%`).join(' and ');
    out.push(`Security deposit: when the landlord returns it, ${parts} (deductions shared the same way).`);
  }
  if (t.from && t.total_cents > 0) out.push(`Total: ${who(t.from)} pays ${who(t.to)} ${money(t.total_cents)}.`);
  const keeps: Record<string, string[]> = {};
  for (const item of s.items) {
    const slot = p.allocation[item.id];
    if (!slot || item.kind === 'lease' || item.kind === 'lease_break_fee') continue;
    if (item.kind === 'pet' && slot.to) {
      out.push(`${item.name} lives with ${who(slot.to)}.${slot.weekends ? ` ${who(slot.weekends)} has ${item.name} every other weekend.` : ''}`);
    } else if (!slot.to) out.push(`${item.name} gets cancelled.`);
    else (keeps[slot.to] ??= []).push(item.name);
  }
  for (const [id, names] of Object.entries(keeps)) {
    out.splice(out.length, 0, `${who(id)} keeps ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]}.`);
  }
  return out;
}

function Signature({ name, signed }: { name: string; signed: boolean }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ height: 76, borderBottom: '3px solid var(--ink)', position: 'relative', display: 'flex', alignItems: 'flex-end' }}>
        <motion.span
          initial={false}
          animate={{ clipPath: signed ? 'inset(0 0% 0 0)' : 'inset(0 100% 0 0)' }}
          transition={{ duration: 0.9, ease: [0.3, 0.7, 0.2, 1] }}
          style={{ fontFamily: 'var(--font-hand)', fontSize: 68, lineHeight: 1, color: '#1d3b8c', paddingLeft: 8, rotate: '-3deg' }}>
          {name}
        </motion.span>
        {!signed && <span style={{ position: 'absolute', left: 8, bottom: 10, fontSize: 18, color: 'var(--ink-2)', fontWeight: 700 }}>waiting for {name} to reply YES…</span>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17, fontWeight: 700, color: 'var(--ink-2)', marginTop: 6 }}>
        <span>{name}</span>
        <span style={{ color: signed ? 'var(--accent)' : undefined }}>{signed ? 'SIGNED · replied YES' : 'not yet'}</span>
      </div>
    </div>
  );
}

export function AgreementOverlay({ s, view }: { s: Snapshot; view: View }) {
  const p = view.agreement;
  const [a, b] = roles(s);
  const show = !!p && !view.split;
  const t = p?.transfer;
  const lease = s.items.find((i) => i.kind === 'lease');
  const keeper = p && lease ? p.allocation[lease.id]?.to : null;
  return (
    <>
      <AnimatePresence>
        {show && p && (
          <motion.div key="agreement" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.5, delay: 0.3 } }}
            style={{ position: 'absolute', inset: 0, zIndex: 40, background: 'rgba(42,35,32,.38)', display: 'grid', placeItems: 'center' }}>
            <motion.article
              initial={{ y: 120, scale: 0.85, rotate: 2, opacity: 0 }}
              animate={{ y: 0, scale: 1, rotate: -0.6, opacity: 1 }}
              exit={{ y: -60, scale: 0.92, opacity: 0, transition: { duration: 0.4 } }}
              transition={{ type: 'spring', stiffness: 200, damping: 22 }}
              aria-label="Final agreement"
              style={{ width: 1040, background: 'var(--surface)', color: 'var(--ink)', borderRadius: 'var(--r-lg)', padding: 'var(--s5)', boxShadow: 'var(--shadow-lg)', position: 'relative' }}>
              <div style={{ position: 'absolute', top: -18, left: 80, width: 160, height: 40, background: 'var(--tape)', rotate: '-4deg', opacity: 0.95 }} />
              <div style={{ position: 'absolute', top: -18, right: 80, width: 160, height: 40, background: 'var(--tape)', rotate: '5deg', opacity: 0.95 }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 54, letterSpacing: '-0.02em' }}>The agreement</div>
                <div style={{ fontWeight: 700, fontSize: 20, color: 'var(--ink-2)' }}>gudtrms · Case {s.case?.code}</div>
              </div>
              <ul className="scroll" style={{ margin: '14px 0 22px', padding: '0 8px 0 0', listStyle: 'none', display: 'grid', gap: 8, maxHeight: 340 }}>
                {agreementTerms(s, p).map((line, i) => (
                  <motion.li key={line} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + i * 0.08 }}
                    style={{ fontSize: 25, fontWeight: 600, lineHeight: 1.3, display: 'flex', gap: 14 }}>
                    <span style={{ color: 'var(--accent)', fontWeight: 700 }}>—</span>{line}
                  </motion.li>
                ))}
              </ul>
              <div style={{ display: 'flex', alignItems: 'center', gap: 26, marginBottom: 22 }}>
                {t?.from && <IOU layoutId="iou" from={nameOf(s.participants.find((x) => x.id === t.from))} to={nameOf(s.participants.find((x) => x.id === t.to))}
                  totalCents={t.total_cents} buyoutCents={t.buyout_cents} depositCents={t.deposit_cents} />}
                {keeper && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 22, fontWeight: 700 }}>
                    <Keys layoutId="keys" size={70} /> keys go to {nameOf(s.participants.find((x) => x.id === keeper))}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 40 }}>
                {[a, b].map((x) => x && <Signature key={x.id} name={nameOf(x)} signed={!!view.signed[x.id]} />)}
              </div>
            </motion.article>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {view.split && (
          <motion.div key="parted" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 1.1 } }} exit={{ opacity: 0 }}
            style={{ position: 'absolute', left: 0, right: 0, top: 300, zIndex: 30, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
            <motion.div initial={{ scale: 0.6, rotate: -4 }} animate={{ scale: 1, rotate: -2, transition: { delay: 1.1, type: 'spring', stiffness: 260, damping: 16 } }}
              className="card" style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 58, lineHeight: 1.02, textAlign: 'center', letterSpacing: '-0.03em', padding: 'var(--s3) var(--s4)', boxShadow: 'var(--shadow-lg)' }}>
              Parted on<br />
              {/* Same treatment as the header wordmark */}
              <span style={{ letterSpacing: '-0.035em' }}>gud<span style={{ fontStyle: 'italic', fontWeight: 400, color: 'var(--accent)' }}>trms</span>.</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ---------- Generic modal shell ---------- */

function Modal({ onClose, children, width = 1240, label }: { onClose: () => void; children: ReactNode; width?: number; label: string }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
      style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(42,35,32,.38)', display: 'grid', placeItems: 'center' }}>
      <motion.div role="dialog" aria-label={label} onClick={(e) => e.stopPropagation()}
        initial={{ y: 40, scale: 0.96 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, opacity: 0 }} transition={{ type: 'spring', stiffness: 360, damping: 28 }}
        style={{ width, maxHeight: 980, overflow: 'auto', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: 'var(--s5)', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: -36 }}>
          <button className="btn" onClick={onClose} aria-label="Close"><Icon name="x" /> <span className="kbd">Esc</span></button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

/* ---------- Is it fair? ---------- */

function Bars({ label, fair, got, buyoutIn, final, max }: { label: string; fair: number; got: number; buyoutIn: number; final: number; max: number }) {
  const w = (v: number) => `${Math.max(0, (v / max) * 100)}%`;
  const bar = (title: string, value: number, color: string, extra?: ReactNode, delay = 0) => (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr 150px', alignItems: 'center', gap: 16 }}>
      <span style={{ fontSize: 20, color: 'var(--ink-2)', fontWeight: 600 }}>{title}</span>
      <div style={{ height: 36, background: 'var(--surface-2)', borderRadius: 8, position: 'relative', overflow: 'hidden' }}>
        <motion.div initial={{ width: 0 }} animate={{ width: w(value) }} transition={{ type: 'spring', stiffness: 120, damping: 20, delay }}
          style={{ position: 'absolute', inset: '0 auto 0 0', background: color, borderRadius: 8 }} />
        {extra}
      </div>
      <span className="num" style={{ fontSize: 26, fontWeight: 700, textAlign: 'right' }}><Ticker cents={value} /></span>
    </div>
  );
  return (
    <div style={{ display: 'grid', gap: 10, padding: '18px 0', borderBottom: '2px solid var(--line)' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 34 }}>{label}</div>
      {bar('Fair share (half of what it all means to them)', fair, 'var(--kraft)')}
      {bar('Stuff they end up with', got, 'var(--deal)', undefined, 0.1)}
      {bar(`${buyoutIn >= 0 ? 'Plus' : 'Minus'} the buyout (${money(Math.abs(buyoutIn))})`, final, 'var(--accent)', (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
          style={{ position: 'absolute', top: 0, bottom: 0, left: w(fair), borderLeft: '4px dashed var(--surface)' }} />
      ), 0.2)}
      <div style={{ fontSize: 21, fontWeight: 700, color: 'var(--accent)' }}>
        Ends up <span className="num">{money(final - fair)}</span> above their fair share
      </div>
    </div>
  );
}

function Playground({ initial, onReplay }: { initial: Valuation[]; onReplay: (vals: Valuation[]) => void }) {
  const items = demoItems.filter((i) => i.kind !== 'subscription');
  const [who, setWho] = useState<string>(demoConstraints[0]!.participant_id);
  const [itemId, setItemId] = useState(items[3]?.id ?? items[0]!.id);
  const [vals, setVals] = useState<Valuation[]>(initial);
  const outcome = demoItems.find((i) => i.id === itemId)?.kind === 'pet' ? 'full' : 'keep';
  const current = vals.find((v) => v.participant_id === who && v.item_id === itemId && v.outcome === outcome)?.value_cents ?? 0;
  const windows: Record<string, MoveOutWindow> = {};
  for (const c of demoConstraints) if (c.kind === 'move_out_window') windows[c.participant_id] = c.value;
  const ids = [...new Set(demoConstraints.map((c) => c.participant_id))];
  const names: Record<string, string> = { [ids[0]!]: 'Alex', [ids[1]!]: 'Sam' };
  // The real mediator's best split for these numbers (cheap: it's lazy, so this takes one candidate).
  const best = candidates({ a: ids[0]!, b: ids[1]!, items: demoItems, valuations: vals, deposits: demoDeposits, windows }).next().value ?? null;
  const set = (cents: number) => setVals((vs) => [
    ...vs.filter((v) => !(v.participant_id === who && v.item_id === itemId && v.outcome === outcome)),
    { participant_id: who, item_id: itemId, outcome, value_cents: cents },
  ]);
  const gets = (pid: string) => demoItems.filter((i) => best?.allocation[i.id]?.to === pid).map((i) => i.name).join(', ') || 'nothing';
  return (
    <div style={{ marginTop: 24, padding: 22, borderRadius: 16, border: '2px dashed var(--accent)' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 30 }}>Fairness playground</div>
      <div style={{ fontSize: 19, color: 'var(--ink-2)', marginBottom: 14 }}>Change what one ex thinks something is worth. The real mediator recomputes the best split and the buyout live.</div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', fontSize: 20 }}>
        <select value={who} onChange={(e) => setWho(e.target.value)} style={{ fontSize: 20, padding: 8, borderRadius: 8 }}>
          {ids.map((id) => <option key={id} value={id}>{names[id]}</option>)}
        </select>
        <span>values</span>
        <select value={itemId} onChange={(e) => setItemId(e.target.value)} style={{ fontSize: 20, padding: 8, borderRadius: 8 }}>
          {items.map((i) => <option key={i.id} value={i.id}>{i.kind === 'pet' ? `${i.name} (full-time)` : i.kind === 'lease' ? 'staying in the apartment' : i.name}</option>)}
        </select>
        <span>at</span>
        <input type="range" min={0} max={300000} step={1000} value={current} onChange={(e) => set(Number(e.target.value))} style={{ width: 380, accentColor: 'var(--accent)' }} aria-label="Value in dollars" />
        <span className="num" style={{ fontWeight: 700, fontSize: 26, minWidth: 110 }}>{money(current)}</span>
      </div>
      {best && (
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          {ids.map((id) => (
            <div key={id} style={{ background: 'var(--surface-2)', borderRadius: 12, padding: 14 }}>
              <div style={{ fontWeight: 700, color: 'var(--ink-3)', fontSize: 16, letterSpacing: '0.08em' }}>{names[id]!.toUpperCase()} GETS</div>
              <div style={{ fontSize: 21, fontWeight: 700 }}>{gets(id)}</div>
            </div>
          ))}
          <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: 14 }}>
            <div style={{ fontWeight: 700, color: 'var(--ink-3)', fontSize: 16, letterSpacing: '0.08em' }}>MONEY</div>
            <div style={{ fontSize: 21, fontWeight: 700 }}>
              {best.transfer.from ? <>{names[best.transfer.from]} pays {names[best.transfer.to!]} <Ticker cents={best.transfer.total_cents} style={{ color: 'var(--accent)' }} /></> : 'Nobody pays'}
            </div>
          </div>
        </div>
      )}
      <button className="btn hot" style={{ marginTop: 16 }} onClick={() => onReplay(vals)}><Icon name="replay" /> Replay the negotiation with these numbers</button>
    </div>
  );
}

export function MathOverlay({ s, view, onClose, onReplay }: { s: Snapshot; view: View; onClose: () => void; onReplay: ((vals: Valuation[]) => void) | null }) {
  const p = view.agreement ?? view.current;
  const f = p ? fairness(s, p) : null;
  const max = f ? Math.max(...f.rows.flatMap((r) => [r.fair, r.got, r.final]), 1) : 1;
  return (
    <Modal onClose={onClose} label="Is it fair?">
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 52, letterSpacing: '-0.02em' }}>Is it fair?</div>
      <div style={{ fontSize: 21, color: 'var(--ink-2)', maxWidth: 980 }}>
        Each item goes where it's worth the most in total. Then a buyout evens it out, so both people end up the same amount above their fair share, by their <em>own</em> valuations. The deposit is just their own money coming back, so it's a separate line.
      </div>
      {f && p ? (
        <>
          {f.rows.map((r) => <Bars key={r.participant.id} label={nameOf(r.participant)} {...r} max={max} />)}
          <div style={{ display: 'flex', gap: 22, marginTop: 18, alignItems: 'center', fontSize: 24, fontWeight: 700 }}>
            <Icon name="scale" size={40} style={{ color: 'var(--accent)' }} />
            <span>Surplus <span className="num" style={{ color: 'var(--accent)' }}>{money(f.surplus)}</span>, split evenly: <span className="num">{money(f.surplus / 2)}</span> each.</span>
            {p.transfer.deposit_cents !== 0 && <span style={{ color: 'var(--ink-2)' }}>+ deposit payback <span className="num">{money(Math.abs(p.transfer.deposit_cents))}</span> (separate)</span>}
          </div>
        </>
      ) : <div style={{ fontSize: 24, marginTop: 20, color: 'var(--ink-2)' }}>No proposal yet. Press Space to play the negotiation.</div>}
      {onReplay && <Playground initial={s.valuations as Valuation[]} onReplay={onReplay} />}
    </Modal>
  );
}

/* ---------- Item detail ---------- */

export function DetailCard({ s, view, itemId, declassified, at, onClose }: {
  s: Snapshot; view: View; itemId: string; declassified: boolean; at: { x: number; y: number }; onClose: () => void;
}) {
  const [a, b] = roles(s);
  const item = s.items.find((i) => i.id === itemId);
  const value = valueLookup(s.valuations as never);
  const items = asItems(s);
  const it = items.find((i) => i.id === itemId);
  const slot = view.assigned ? view.current?.allocation[itemId] : undefined;
  const A = nameOf(a); const B = nameOf(b);

  let options: { label: string; a: number; b: number; chosen: boolean }[] = [];
  if (it && a && b) {
    const v = (pid: string, o: Parameters<typeof value>[2]) => value(pid, it, o);
    const is = (to: string | null, weekends: string | null = null) => !!slot && slot.to === to && (slot.weekends ?? null) === weekends;
    if (it.kind === 'pet') {
      options = [
        { label: `${A} full-time`, a: v(a.id, 'full'), b: 0, chosen: is(a.id) },
        { label: `${A}, ${B} every other weekend`, a: v(a.id, 'primary'), b: v(b.id, 'visits'), chosen: is(a.id, b.id) },
        { label: `${B}, ${A} every other weekend`, a: v(a.id, 'visits'), b: v(b.id, 'primary'), chosen: is(b.id, a.id) },
        { label: `${B} full-time`, a: 0, b: v(b.id, 'full'), chosen: is(b.id) },
      ];
    } else if (it.kind === 'lease_break_fee') {
      options = [
        { label: `${A} pays it`, a: v(a.id, 'pay'), b: 0, chosen: is(a.id) },
        { label: `${B} pays it`, a: 0, b: v(b.id, 'pay'), chosen: is(b.id) },
      ];
    } else {
      const keepLabel = it.kind === 'lease' ? 'stays' : 'keeps it';
      options = [
        { label: `${A} ${keepLabel}`, a: v(a.id, 'keep'), b: 0, chosen: is(a.id) },
        { label: `${B} ${keepLabel}`, a: 0, b: v(b.id, 'keep'), chosen: is(b.id) },
      ];
      if (it.kind === 'lease') options.unshift({ label: 'Both move out', a: 0, b: 0, chosen: is(null) });
      if (it.kind === 'subscription') options.unshift({ label: 'Cancel it', a: 0, b: 0, chosen: is(null) });
    }
    // Sorting by total would hint at the hidden numbers, so only sort once declassified.
    if (declassified) options.sort((x, y) => y.a + y.b - (x.a + x.b));
  }

  const x = Math.min(Math.max(at.x - 280, 20), 1920 - 600);
  const y = Math.min(Math.max(at.y + 20, 120), 1080 - 470);
  const cell = (cents: number) => declassified
    ? <span className="num">{money(cents)}</span>
    : <span aria-label="redacted" style={{ display: 'inline-block', width: 84, height: 22, background: 'var(--redact)', borderRadius: 3, verticalAlign: 'middle' }} />;

  return (
    <>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 49 }} />
      <motion.div role="dialog" aria-label={`${item?.name ?? 'Deposit'} details`}
        initial={{ opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }}
        transition={{ type: 'spring', stiffness: 480, damping: 30 }}
        style={{ position: 'absolute', left: x, top: y, width: 580, zIndex: 50, background: 'var(--surface)', border: '2px solid var(--accent)', borderRadius: 16, padding: '20px 24px', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 34 }}>{item?.name ?? 'Security deposit'}</div>
          <button className="btn" style={{ height: 40, padding: '0 12px' }} onClick={onClose} aria-label="Close"><Icon name="x" size={20} /></button>
        </div>
        {!item ? (
          <div style={{ fontSize: 20, color: 'var(--ink-2)', lineHeight: 1.4, marginTop: 8 }}>
            Not part of the fair-share math: it's their own money coming back. If one person stays, the deposit stays with the landlord on their lease and they pay the other back that person's share now. If both move out, the refund is split by what each paid.
            <div style={{ marginTop: 10 }}>{s.deposits.map((d) => <div key={d.participant_id} className="num">{nameOf(s.participants.find((p) => p.id === d.participant_id))} paid {money(d.amount_cents)} <span style={{ color: 'var(--ink-3)' }}>(a shared fact both confirmed)</span></div>)}</div>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 100px', gap: '6px 10px', marginTop: 10, fontSize: 19, alignItems: 'center' }}>
              <span style={{ color: 'var(--ink-3)', fontWeight: 700, fontSize: 15, letterSpacing: '0.08em' }}>OUTCOME</span>
              <span style={{ color: 'var(--ink-3)', fontWeight: 700, fontSize: 15, textAlign: 'right' }}>{A.toUpperCase()}</span>
              <span style={{ color: 'var(--ink-3)', fontWeight: 700, fontSize: 15, textAlign: 'right' }}>{B.toUpperCase()}</span>
              <span style={{ color: 'var(--ink-3)', fontWeight: 700, fontSize: 15, textAlign: 'right' }}>TOTAL</span>
              {options.map((o, i) => (
                <div key={o.label} style={{ display: 'contents', fontWeight: o.chosen ? 800 : 500, color: o.chosen ? 'var(--accent)' : undefined }}>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{o.chosen ? <Icon name="check" size={20} /> : <span style={{ width: 20 }} />}{o.label}{i === 0 && declassified ? <span style={{ fontSize: 14, color: 'var(--ink-3)' }}>· highest</span> : null}</span>
                  <span style={{ textAlign: 'right' }}>{cell(o.a)}</span>
                  <span style={{ textAlign: 'right' }}>{cell(o.b)}</span>
                  <span style={{ textAlign: 'right', fontWeight: 700 }}>{cell(o.a + o.b)}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14, fontSize: 19, lineHeight: 1.4, color: 'var(--ink-2)' }}>
              {declassified
                ? 'The mediator picks the outcome worth the most to both of them combined, then the buyout evens out the money. Neither ex ever sees the other\'s numbers.'
                : <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><Icon name="lock" size={20} /> Private values are redacted. Press <span className="kbd">X</span> to declassify.</span>}
            </div>
          </>
        )}
      </motion.div>
    </>
  );
}

/* ---------- Shortcuts ---------- */

export function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ['X', 'Declassify / re-redact both sides'], ['Space', 'Play / pause'], ['R', 'Replay from the start'],
    ['← →', 'Step back / forward'], ['1  2', 'Speed 1x / 2x'], ['F', 'Is it fair? (math breakdown)'],
    ['L', 'Switch mock / live data'], ['M', 'Mute / unmute'], ['?', 'This help'], ['Esc', 'Close'],
  ];
  return (
    <Modal onClose={onClose} width={760} label="Keyboard shortcuts">
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 44, marginBottom: 14 }}>Shortcuts</div>
      {rows.map(([k, d]) => (
        <div key={k} style={{ display: 'flex', gap: 18, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 22 }}>
          <span className="kbd" style={{ minWidth: 86, height: 40, fontSize: 19 }}>{k}</span>{d}
        </div>
      ))}
    </Modal>
  );
}
