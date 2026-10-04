import { AnimatePresence, LayoutGroup, motion, useAnimationControls } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Valuation } from '../../src/shared/types.ts';
import { Header, LeakLog, MathCompact, Timeline } from './components/Chrome.tsx';
import { placeItems } from './components/Items.tsx';
import { AgreementOverlay, DetailCard, MathOverlay, ShortcutsOverlay } from './components/Overlays.tsx';
import { Side } from './components/Side.tsx';
import { TapeZone } from './components/TapeZone.tsx';
import { nameOf } from './data/format.ts';
import { useLiveSnapshot, useOnAdvance, usePlayback } from './data/hooks.ts';
import { mockSnapshot } from './data/mock.ts';
import { buildSteps, roles, viewAt } from './data/timeline.ts';
import type { Mode, Snapshot } from './data/types.ts';
import { buzz, rip, setMuted, thud, tick, unlockAudio } from './sound.ts';

const params = new URLSearchParams(location.search);
const EMPTY: Snapshot = {
  source: 'live', case: null, participants: [], items: [], valuations: [], constraints: [], deposits: [],
  proposals: [], decisions: [], notes: [], leaks: [], agreements: [],
};

function readMode(): Mode {
  const q = params.get('mode');
  if (q === 'mock' || q === 'live') return q;
  try { return localStorage.getItem('judge-mode') === 'live' ? 'live' : 'mock'; } catch { return 'mock'; }
}

/** Fit the fixed 1920x1080 stage to the window. */
function useStageScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return scale;
}

export default function App() {
  const [mode, setModeState] = useState<Mode>(readMode);
  const [mockVals, setMockVals] = useState<Valuation[] | undefined>(undefined);
  const [declassified, setDeclassified] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [selected, setSelected] = useState<{ id: string; x: number; y: number } | null>(null);
  const [mathOpen, setMathOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const scale = useStageScale();
  const stageRef = useRef<HTMLDivElement>(null);
  const shake = useAnimationControls();

  const live = useLiveSnapshot(mode, params.get('code'));
  const mock = useMemo(() => mockSnapshot(mockVals), [mockVals]);
  const s: Snapshot = mode === 'mock' ? mock : live.data ?? EMPTY;
  const steps = useMemo(() => buildSteps(s), [s]);
  const pb = usePlayback(steps);
  const view = useMemo(() => viewAt(s, steps, pb.cursor), [s, steps, pb.cursor]);
  const items = useMemo(() => placeItems(s, view), [s, view]);
  const [a, b] = roles(s);

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    try { localStorage.setItem('judge-mode', m); } catch { /* private window: fine */ }
    setSelected(null);
    pb.seek(0);
    if (m === 'live') pb.play(); // follow the negotiation as it happens
  }, [pb]);

  // Live mode starts playing so new moves play in as they're written.
  useEffect(() => { if (mode === 'live') pb.play(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const doShake = useCallback(() => {
    void shake.start({ x: [0, -18, 16, -12, 9, -5, 0], transition: { duration: 0.45 } });
  }, [shake]);

  useOnAdvance(steps, pb.cursor, (st) => {
    if (st.kind === 'proposal') tick();
    else if (st.kind === 'decision') thud();
    else if (st.kind === 'verdict') { thud(true); if (!st.deal) doShake(); }
    else if (st.kind === 'rogue') { buzz(); setTimeout(() => { thud(true); doShake(); }, 420); }
    else if (st.kind === 'agreement' || st.kind === 'sign') tick();
    else if (st.kind === 'declined') { thud(true); doShake(); }
    else if (st.kind === 'split') setTimeout(() => rip(true), 200);
  });

  const toggleDeclassify = useCallback(() => { setDeclassified((d) => !d); rip(); }, []);
  const toggleMute = useCallback(() => setMutedState((m) => { setMuted(!m); return !m; }), []);

  const onSelect = useCallback((id: string, el: HTMLElement) => {
    const stage = stageRef.current?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (!stage) return;
    setSelected((cur) => (cur?.id === id ? null : {
      id, x: (r.left + r.width / 2 - stage.left) / scale, y: (r.bottom - stage.top) / scale,
    }));
  }, [scale]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      unlockAudio();
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.metaKey || e.ctrlKey) return;
      const k = e.key.toLowerCase();
      if (k === 'x') toggleDeclassify();
      else if (k === ' ') { e.preventDefault(); pb.toggle(); }
      else if (k === 'r') pb.replay();
      else if (k === 'arrowright') pb.stepBy(1);
      else if (k === 'arrowleft') pb.stepBy(-1);
      else if (k === '1') pb.setSpeed(1);
      else if (k === '2') pb.setSpeed(2);
      else if (k === 'm') toggleMute();
      else if (k === 'f') setMathOpen((o) => !o);
      else if (k === 'l') setMode(mode === 'mock' ? 'live' : 'mock');
      else if (k === '?' || (k === '/' && e.shiftKey)) setHelpOpen((o) => !o);
      else if (k === 'escape') { setSelected(null); setMathOpen(false); setHelpOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', unlockAudio);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', unlockAudio); };
  }, [pb, toggleDeclassify, toggleMute, setMode, mode]);

  const t = view.split ? view.agreement?.transfer : null;
  const iouFor = (pid: string | undefined) => (t?.from && t.to === pid ? {
    from: nameOf(s.participants.find((p) => p.id === t.from)), to: nameOf(s.participants.find((p) => p.id === t.to)),
    totalCents: t.total_cents, buyoutCents: t.buyout_cents, depositCents: t.deposit_cents,
  } : null);
  const lease = s.items.find((i) => i.kind === 'lease');
  const keeper = view.split && view.agreement && lease ? view.agreement.allocation[lease.id]?.to : null;

  const sideProps = { s, view, declassified, onSelect, selectedId: selected?.id ?? null };
  const tear = (dir: -1 | 1) => (view.split
    // Pull apart a little and ease inward, so the sides never crowd the screen edge.
    ? { x: 0, rotate: dir * 0.6, scale: 0.9, transition: { type: 'spring' as const, stiffness: 70, damping: 12, delay: 0.25 } }
    : { x: 0, rotate: 0, scale: 1 });

  return (
    <div className="viewport">
      <div ref={stageRef} className="stage" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        <h1 className="sr-only">gudtrms judge view: what each advocate knows, and what crosses between them</h1>
        <Header s={s} view={view} mode={mode} onMode={setMode} declassified={declassified} onDeclassify={toggleDeclassify}
          muted={muted} onMute={toggleMute} onHelp={() => setHelpOpen(true)} liveError={mode === 'live' ? live.error : null} />

        <LayoutGroup>
          <motion.main animate={shake}
            style={{ height: `calc(1080px - var(--header-h) - var(--footer-h))`, display: 'grid', gridTemplateColumns: '1fr var(--col-mid) 1fr', gap: 'var(--s4)', padding: 'var(--s2) var(--s5) 0' }}>
            {a && b ? (
              <>
                <motion.div animate={tear(-1)} style={{ minWidth: 0 }}>
                  <Side {...sideProps} p={a} side="left" items={items.filter((p) => p.state === 'box' && p.to === a.id)} iou={iouFor(a.id)} keys={keeper === a.id} />
                </motion.div>
                <TapeZone s={s} view={view} items={items} onSelect={onSelect} selectedId={selected?.id ?? null} leftId={a.id} />
                <motion.div animate={tear(1)} style={{ minWidth: 0 }}>
                  <Side {...sideProps} p={b} side="right" items={items.filter((p) => p.state === 'box' && p.to === b.id)} iou={iouFor(b.id)} keys={keeper === b.id} />
                </motion.div>
              </>
            ) : (
              <div style={{ gridColumn: '1 / -1', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
                <div>
                  <div className="serif" style={{ fontWeight: 600, fontSize: 56 }}>{mode === 'live' ? (live.error ? 'Live data is offline' : 'Waiting for a case…') : 'Loading…'}</div>
                  <div style={{ fontSize: 22, color: 'var(--ink-2)', marginTop: 'var(--s2)' }}>
                    {live.error ? `${live.error}. Check DATABASE_URL in the repo's .env, or press L for mock data.` : 'Run npm run db:reset and npm run demo:negotiate, or press L for mock data.'}
                  </div>
                </div>
              </div>
            )}
          </motion.main>

          <AgreementOverlay s={s} view={view} />
        </LayoutGroup>

        <footer style={{ height: 'var(--footer-h)', display: 'flex', gap: 'var(--s4)', padding: 'var(--s3) var(--s5) var(--s4)', alignItems: 'stretch' }}>
          <Timeline s={s} steps={steps} cursor={pb.cursor} playing={pb.playing} speed={pb.speed}
            onSeek={pb.seek} onToggle={pb.toggle} onReplay={pb.replay} onSpeed={pb.setSpeed} />
          <MathCompact s={s} view={view} onOpen={() => setMathOpen(true)} />
          <LeakLog s={s} view={view} />
        </footer>

        {view.status === 'Stuck' && (
          <div className="pill" style={{ position: 'absolute', left: '50%', bottom: 'calc(var(--footer-h) + var(--s2))', translate: '-50% 0', zIndex: 20, background: 'var(--nodeal)', color: 'var(--surface)', height: 48, fontSize: 18, boxShadow: 'var(--shadow-md)' }}>
            No deal yet · each advocate privately asks its own person to relax something
          </div>
        )}

        <AnimatePresence>
          {selected && <DetailCard key={selected.id} s={s} view={view} itemId={selected.id} declassified={declassified} at={selected} onClose={() => setSelected(null)} />}
          {mathOpen && <MathOverlay key="math" s={s} view={view} onClose={() => setMathOpen(false)}
            onReplay={mode === 'mock' ? (vals) => { setMockVals(vals); setMathOpen(false); pb.replay(); } : null} />}
          {helpOpen && <ShortcutsOverlay key="help" onClose={() => setHelpOpen(false)} />}
        </AnimatePresence>
      </div>
    </div>
  );
}
