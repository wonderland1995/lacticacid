"use client";

import { useState, useTransition } from "react";
import { upsertPointAction, updateNotesAction } from "@/app/actions/lactate";
import { LactateChart } from "@/components/charts/LactateChart";
import { type LactatePoint, type LactateProtocol } from "@/lib/types";
import { formatPace, parsePaceInput } from "@/lib/utils";

type Props = {
  testId: string;
  protocol: LactateProtocol;
  initialPoints: LactatePoint[];
  initialNotes?: string | null;
};

type FormState = {
  stageIndex: number;
  pace: string;
  lactate: string;
  hr: string;
  rpe: string;
  comments: string;
};

export function SessionDetail({ testId, protocol, initialPoints, initialNotes }: Props) {
  const [points, setPoints] = useState<LactatePoint[]>(initialPoints);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [form, setForm] = useState<FormState>({
    stageIndex: points[points.length - 1]?.stage_index ?? 1,
    pace: "",
    lactate: "",
    hr: "",
    rpe: "",
    comments: "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [savingNotes, startSavingNotes] = useTransition();

  const handleSavePoint = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);

    const stageIndex = Number(form.stageIndex);
    const paceSeconds = parsePaceInput(form.pace);
    const lactateValue = Number(form.lactate);
    if (!Number.isFinite(stageIndex) || stageIndex < 1) {
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
          stageIndex,
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
          setMessage(`Saved stage ${stageIndex}.`);
        }
      })();
    });
  };

  const handleUpdateNotes = (e: React.FormEvent) => {
    e.preventDefault();
    startSavingNotes(() => {
      void (async () => {
        const result = await updateNotesAction(testId, notes);
        if (result.error) {
          setError(result.error);
          return;
        }
        setMessage("Notes updated.");
      })();
    });
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        <div className="rounded-2xl bg-white/80 p-6 shadow-sm ring-1 ring-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">Lactate vs pace</h3>
          <p className="text-sm text-slate-600">Faster pace is to the right. Add points to see the curve evolve.</p>
          <div className="mt-4 h-80">
            <LactateChart points={points} />
          </div>
        </div>

        <div className="rounded-2xl bg-white/80 p-6 shadow-sm ring-1 ring-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">Edit points</h3>
          <form onSubmit={handleSavePoint} className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Stage #
              <input
                type="number"
                min={1}
                max={protocol.numStages}
                value={form.stageIndex}
                onChange={(e) => setForm((prev) => ({ ...prev, stageIndex: Number(e.target.value) }))}
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
              Notes for this stage
              <textarea
                value={form.comments}
                onChange={(e) => setForm((prev) => ({ ...prev, comments: e.target.value }))}
                rows={2}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-inner outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                placeholder="Optional"
              />
            </label>
            <div className="md:col-span-2 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {saving ? "Saving..." : "Save / Update point"}
              </button>
              {message && <span className="text-sm text-emerald-700">{message}</span>}
              {error && <span className="text-sm text-rose-700">{error}</span>}
            </div>
          </form>
        </div>

        <div className="rounded-2xl bg-white/80 p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-lg font-semibold text-slate-900">Captured stages</h3>
            <p className="text-sm text-slate-600">
              {points.length} / {protocol.numStages} stages
            </p>
          </div>
          {!points.length ? (
            <p className="mt-3 text-sm text-slate-600">Add a point to start building the curve.</p>
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
                      <td className="px-4 py-2 text-slate-700">{p.hr_bpm ?? "-"}</td>
                      <td className="px-4 py-2 text-slate-700">{p.rpe ?? "-"}</td>
                      <td className="px-4 py-2 text-slate-700">{p.comments ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl bg-white/80 p-6 shadow-sm ring-1 ring-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">Session notes</h3>
          <form onSubmit={handleUpdateNotes} className="mt-3 space-y-3">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-inner outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
              placeholder="Warmup details, conditions, tester notes..."
            />
            <button
              type="submit"
              disabled={savingNotes}
              className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {savingNotes ? "Saving..." : "Save notes"}
            </button>
          </form>
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
              <dt>Stages</dt>
              <dd>{protocol.numStages}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Sample timing</dt>
              <dd>
                {Math.floor(protocol.sampleOffsetSeconds / 60)}:
                {(protocol.sampleOffsetSeconds % 60).toString().padStart(2, "0")} +/- {protocol.sampleWindowSeconds}s
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
