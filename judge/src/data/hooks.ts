import { useEffect, useRef, useState } from 'react';
import { STEP_MS, type Step } from './timeline.ts';
import type { Mode, Snapshot } from './types.ts';

/** Live: polls GET /api/snapshot every second. Mock: never fetches. */
export function useLiveSnapshot(mode: Mode, code: string | null) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== 'live') return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    let lastBody = '';
    const tick = async () => {
      try {
        const res = await fetch(`/api/snapshot${code ? `?code=${encodeURIComponent(code)}` : ''}`, { cache: 'no-store' });
        const text = await res.text();
        const body = JSON.parse(text);
        if (stop) return;
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        // Only re-render when something actually changed.
        if (text !== lastBody) { lastBody = text; setData(body as Snapshot); }
        setError(null);
      } catch (err) {
        if (!stop) setError((err as Error).message);
      }
      if (!stop) timer = setTimeout(tick, 1000);
    };
    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [mode, code]);

  return { data, error };
}

/**
 * The playhead. While playing it advances one step at a time (STEP_MS / speed). At the end it
 * keeps "playing", so new live steps play in as they arrive.
 */
export function usePlayback(steps: Step[]) {
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const last = steps.length - 1;

  // Snapshot shrank (db reset, mode switch): keep the cursor in range.
  useEffect(() => { if (cursor > last) setCursor(Math.max(0, last)); }, [cursor, last]);

  // Depends on the step's kind, not the steps array: live polls make a new array every second,
  // which would otherwise restart this timer before it ever fires.
  const kind = steps[cursor]?.kind ?? 'intake';
  useEffect(() => {
    if (!playing || cursor >= last) return;
    const t = setTimeout(() => setCursor((c) => Math.min(c + 1, last)), STEP_MS[kind] / speed);
    return () => clearTimeout(t);
  }, [playing, cursor, last, speed, kind]);

  return {
    cursor, playing, speed, last,
    setSpeed,
    toggle: () => setPlaying((p) => !p),
    replay: () => { setCursor(0); setPlaying(true); },
    seek: (i: number) => { setPlaying(false); setCursor(Math.max(0, Math.min(i, last))); },
    stepBy: (d: number) => { setPlaying(false); setCursor((c) => Math.max(0, Math.min(c + d, last))); },
    jumpToEnd: () => setCursor(last),
    play: () => setPlaying(true),
  };
}

/** Runs `fn(step)` only when the playhead moves forward by exactly one step (not on scrubs). */
export function useOnAdvance(steps: Step[], cursor: number, fn: (step: Step) => void) {
  const prev = useRef(cursor);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (cursor === prev.current + 1 && steps[cursor]) fnRef.current(steps[cursor]);
    prev.current = cursor;
  }, [cursor, steps]);
}
