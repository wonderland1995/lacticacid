"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import clsx from "clsx";
import { completeTestAction, upsertPointAction } from "@/app/actions/lactate";
import { LactateChart } from "@/components/charts/LactateChart";
import { type LactatePoint, type LactateProtocol } from "@/lib/types";
import { formatDuration, formatPace, parsePaceInput } from "@/lib/utils";

type FormState = {
  stageIndex: number;
  pace: string;
  lactate: string;
  hr: string;
  rpe: string;
  comments: string;
};

type Props = {
  testId: string;
  protocol: LactateProtocol;
  initialPoints: LactatePoint[];
};

export function TestRunner({ testId, protocol, initialPoints }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  const [beepEnabled, setBeepEnabled] = useState(true);
  const [points, setPoints] = useState<LactatePoint[]>(initialPoints);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualStage, setManualStage] = useState(false);
  const [saving, startSaving] = useTransition();
  const [completing, startCompleting] = useTransition();
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastCountdownRef = useRef<number | null>(null);
  const stageBeepedRef = useRef<number | null>(null);

  const totalDuration = useMemo(
    () => protocol.warmupSeconds + protocol.stageSeconds * protocol.numStages,
    [protocol],
  );

  useEffect(() => {
    if (!isRunning) return;
    const id = window.setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [isRunning]);

  useEffect(() => {
    if (elapsed >= totalDuration && isRunning) {
      setIsRunning(false);
      startCompleting(() => {
        void completeTestAction(testId);
      });
    }
  }, [elapsed, isRunning, startCompleting, testId, totalDuration]);

  const inWarmup = elapsed < protocol.warmupSeconds;
  const stageElapsedTotal = Math.max(0, elapsed - protocol.warmupSeconds);
  const rawStageIndex = Math.floor(stageElapsedTotal / protocol.stageSeconds);
  const stageIndex = Math.min(Math.max(rawStageIndex, 0), protocol.numStages - 1);
  const currentStageNumber = inWarmup ? 0 : Math.min(protocol.numStages, stageIndex + 1);
  const stageElapsed = inWarmup ? 0 : stageElapsedTotal - stageIndex * protocol.stageSeconds;
  const phaseRemaining = inWarmup
    ? Math.max(0, protocol.warmupSeconds - elapsed)
    : Math.max(0, protocol.stageSeconds - stageElapsed);
  const totalRemaining = Math.max(0, totalDuration - elapsed);
  const isComplete = elapsed >= totalDuration;

  const [form, setForm] = useState<FormState>({
    stageIndex: currentStageNumber || 1,
    pace: "",
    lactate: "",
    hr: "",
    rpe: "",
    comments: "",
  });

  useEffect(() => {
    if (currentStageNumber > 0 && !manualStage) {
      setForm((prev) => ({ ...prev, stageIndex: currentStageNumber }));
    }
  }, [currentStageNumber, manualStage]);

  useEffect(() => {
    lastCountdownRef.current = null;
    stageBeepedRef.current = null;
  }, [stageIndex]);

  const playBeep = (count: number) => {
    if (!beepEnabled) return;
    if (typeof window === "undefined") return;
    const ctx = audioCtxRef.current ?? new AudioContext();
    audioCtxRef.current = ctx;
    ctx.resume();

    for (let i = 0; i < count; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + i * 0.25;
      const end = start + 0.2;
      osc.frequency.value = i === count - 1 && count > 1 ? 1200 : 900;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.35, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, end);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(end);
    }
  };

  useEffect(() => {
    if (inWarmup || isComplete) return;
    const secondsUntilSample = protocol.sampleOffsetSeconds - Math.floor(stageElapsed);
    if (beepEnabled && secondsUntilSample <= 10 && secondsUntilSample > 0) {
      if (lastCountdownRef.current !== secondsUntilSample) {
        playBeep(1);
        lastCountdownRef.current = secondsUntilSample;
      }
    }
    if (
      beepEnabled &&
      stageElapsed >= protocol.sampleOffsetSeconds &&
      stageBeepedRef.current !== stageIndex
    ) {
      playBeep(2);
      stageBeepedRef.current = stageIndex;
    }
  }, [
    beepEnabled,
    inWarmup,
    isComplete,
    protocol.sampleOffsetSeconds,
    stageElapsed,
    stageIndex,
    protocol.sampleWindowSeconds,
  ]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    setError(null);

    const stageIndexValue = Number(form.stageIndex);
    const paceSeconds = parsePaceInput(form.pace);
    const lactateValue = Number(form.lactate);
    if (!Number.isFinite(stageIndexValue) || stageIndexValue < 1) {
      setError("Stage index must be 1 or greater.");
      return;
    }
    if (paceSeconds === null) {
      setError("Enter pace as mm:ss (e.g. 4:30).");
      return;
    }
    if (!Number.isFinite(lactateValue) || lactateValue <= 0) {
      setError("Enter a valid lactate value.");
      return;
    }

    const hrValue = form.hr ? Number(form.hr) : null;
    const rpeValue = form.rpe ? Number(form.rpe) : null;

    startSaving(() => {
      void (async () => {
        const result = await upsertPointAction({
          testId,
          stageIndex: stageIndexValue,
          paceSecondsPerKm: paceSeconds,
          lactateMmol: lactateValue,
          hrBpm: hrValue,
          rpe: rpeValue,
          comments: form.comments || undefined,
        });
        if (result.error) {
          setError(result.error);
          return;
        }
        if (result.data) {
          setPoints((prev) => {
            const filtered = prev.filter((p) => p.stage_index !== result.data.stage_index);
            return [...filtered, result.data].sort((a, b) => a.stage_index - b.stage_index);
          });
          setForm((prev) => ({
            ...prev,
            pace: "",
            lactate: "",
            hr: "",
            rpe: "",
            comments: "",
          }));
          setStatus(`Saved stage ${stageIndexValue}.`);
        }
      })();
    });
  };

  const sampleWindowState = useMemo(() => {
    if (inWarmup) return { label: "Sampling starts in the first stage", tone: "muted" as const };
    const beforeSample = protocol.sampleOffsetSeconds - stageElapsed;
    const windowEnd = protocol.sampleOffsetSeconds + protocol.sampleWindowSeconds;
    if (beforeSample > 0) {
      return {
        label: `Sample in ${formatDuration(beforeSample)}`,
        tone: "info" as const,
      };
    }
    if (stageElapsed <= windowEnd) {
      const remaining = windowEnd - stageElapsed;
      return {
        label: `TAKE SAMPLE NOW (${formatDuration(remaining)} left)`,
        tone: "alert" as const,
      };
    }
    return {
      label: "Sample window passed (enter when ready)",
      tone: "muted" as const,
    };
  }, [inWarmup, protocol.sampleOffsetSeconds, protocol.sampleWindowSeconds, stageElapsed]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <section className="lg:col-span-2 space-y-4">
        <div className="rounded-2xl bg-white/80 p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">{inWarmup ? "Warmup" : "Stage"}</p>
              <h2 className="text-2xl font-semibold text-slate-900">
                {inWarmup ? "Warmup in progress" : `Stage ${currentStageNumber} / ${protocol.numStages}`}
              </h2>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700">
              <span className="text-slate-500">Beep</span>
              <button
                onClick={() => setBeepEnabled((v) => !v)}
                className={clsx(
                  "flex items-center rounded-full px-3 py-1 text-xs font-semibold transition",
                  beepEnabled ? "bg-emerald-500 text-white" : "bg-slate-300 text-slate-800",
                )}
              >
                {beepEnabled ? "On" : "Off"}
              </button>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <TimerCard label="Total elapsed" value={formatDuration(elapsed)} />
            <TimerCard label="Phase remaining" value={formatDuration(phaseRemaining)} />
            <TimerCard label="Total remaining" value={formatDuration(totalRemaining)} />
            <TimerCard label="Sampling" value={sampleWindowState.label} tone={sampleWindowState.tone} />
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={() => setIsRunning((v) => !v)}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              {isRunning ? "Pause" : "Resume"}
            </button>
            <button
              onClick={() => {
                setElapsed(0);
                setIsRunning(false);
              }}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-500"
            >
              Reset clock
            </button>
            <button
              onClick={() => {
                setElapsed(totalDuration);
                setIsRunning(false);
                startCompleting(() => {
                  void completeTestAction(testId);
                });
              }}
              disabled={completing}
              className="rounded-xl border border-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {completing ? "Finishing..." : "Mark test complete"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl bg-white/80 p-6 shadow-sm ring-1 ring-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">Capture data</h3>
          <p className="text-sm text-slate-600">Default stage is the current active stage.</p>
          <form onSubmit={handleSave} className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Stage #
              <input
                type="number"
                min={1}
                max={protocol.numStages}
                value={form.stageIndex}
                onChange={(e) => {
                  setManualStage(true);
                  setForm((prev) => ({ ...prev, stageIndex: Number(e.target.value) }));
                }}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-inner outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Pace (mm:ss per km)
              <input
                type="text"
                inputMode="decimal"
                required
                value={form.pace}
                onChange={(e) => setForm((prev) => ({ ...prev, pace: e.target.value }))}
                placeholder="4:30"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-inner outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Lactate (mmol/L)
              <input
                type="number"
                step="0.1"
                min="0"
                required
                value={form.lactate}
                onChange={(e) => setForm((prev) => ({ ...prev, lactate: e.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-inner outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Heart rate (bpm)
              <input
                type="number"
                min="0"
                value={form.hr}
                onChange={(e) => setForm((prev) => ({ ...prev, hr: e.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-inner outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                placeholder="Optional"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              RPE (1-10)
              <input
                type="number"
                min="1"
                max="10"
                value={form.rpe}
                onChange={(e) => setForm((prev) => ({ ...prev, rpe: e.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-inner outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                placeholder="Optional"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700 md:col-span-2">
              Notes
              <textarea
                value={form.comments}
                onChange={(e) => setForm((prev) => ({ ...prev, comments: e.target.value }))}
                rows={2}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-inner outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                placeholder="Optional comments for this stage"
              />
            </label>
            <div className="md:col-span-2 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {saving ? "Saving..." : "Save stage data"}
              </button>
              {status && <span className="text-sm text-emerald-700">{status}</span>}
              {error && <span className="text-sm text-rose-700">{error}</span>}
            </div>
          </form>
        </div>

        <div className="rounded-2xl bg-white/80 p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-lg font-semibold text-slate-900">Points entered</h3>
            <p className="text-sm text-slate-600">
              {points.length} / {protocol.numStages} stages captured
            </p>
          </div>
          {!points.length ? (
            <p className="mt-3 text-sm text-slate-600">No data yet. Save a stage to begin plotting the lactate curve.</p>
          ) : (
            <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">Stage</th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">Pace</th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">Lactate</th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">HR</th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">RPE</th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {points.map((p) => (
                    <tr key={p.stage_index} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-semibold text-slate-800">{p.stage_index}</td>
                      <td className="px-4 py-2 text-slate-700">{formatPace(p.pace_seconds_per_km)}</td>
                      <td className="px-4 py-2 text-slate-700">{p.lactate_mmol} mmol/L</td>
                      <td className="px-4 py-2 text-slate-700">{p.hr_bpm ?? "—"}</td>
                      <td className="px-4 py-2 text-slate-700">{p.rpe ?? "—"}</td>
                      <td className="px-4 py-2 text-slate-700">{p.comments ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div className="rounded-2xl bg-white/80 p-6 shadow-sm ring-1 ring-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">Lactate vs pace</h3>
          <p className="text-sm text-slate-600">Faster pace is to the right (axis is inverted).</p>
          <div className="mt-4 h-72">
            <LactateChart points={points} />
          </div>
        </div>
        <div className="rounded-2xl bg-white/80 p-6 shadow-sm ring-1 ring-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">Protocol</h3>
          <dl className="mt-3 space-y-2 text-sm text-slate-700">
            <div className="flex justify-between">
              <dt>Warmup</dt>
              <dd>{Math.round(protocol.warmupSeconds / 60)} minutes</dd>
            </div>
            <div className="flex justify-between">
              <dt>Stage length</dt>
              <dd>{Math.round(protocol.stageSeconds / 60)} minutes</dd>
            </div>
            <div className="flex justify-between">
              <dt>Number of stages</dt>
              <dd>{protocol.numStages}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Sample timing</dt>
              <dd>
                {Math.floor(protocol.sampleOffsetSeconds / 60)}:
                {(protocol.sampleOffsetSeconds % 60).toString().padStart(2, "0")} ± {protocol.sampleWindowSeconds}s
              </dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}

function TimerCard({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "info" | "alert" | "muted" }) {
  return (
    <div
      className={clsx(
        "rounded-xl border px-4 py-3 shadow-sm",
        tone === "alert"
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : tone === "info"
            ? "border-sky-200 bg-sky-50 text-sky-900"
            : tone === "muted"
              ? "border-slate-200 bg-slate-50 text-slate-700"
              : "border-slate-200 bg-white text-slate-900",
      )}
    >
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
