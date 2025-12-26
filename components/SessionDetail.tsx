"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { importPointsAction, upsertPointAction, updateNotesAction, type ImportPointInput } from "@/app/actions/lactate";
import { LactateChart } from "@/components/charts/LactateChart";
import { estimateLT1, estimateLT2, type ThresholdEstimate } from "@/lib/thresholds";
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
  speed: string;
  cadence: string;
  metrics: string;
};

type RowDraft = {
  pace: string;
  lactate: string;
  hr: string;
  rpe: string;
  comments: string;
  speed: string;
  metrics: Record<string, string>;
};

const normalizePoints = (pts: LactatePoint[]) => pts.map((p) => ({ ...p, metrics: p.metrics ?? {} }));

const paceLabel = (seconds: number | null | undefined) =>
  seconds && seconds > 0 ? formatPace(seconds).replace("/km", "") : "--";

const metricValueToString = (value: unknown) => {
  if (value === null || typeof value === "undefined") return "";
  return typeof value === "number" ? value.toString() : String(value);
};

const buildRowDrafts = (points: LactatePoint[], metricKeys: string[]): Record<number, RowDraft> => {
  const drafts: Record<number, RowDraft> = {};
  points.forEach((p) => {
    const metrics: Record<string, string> = {};
    const combinedKeys = new Set([...metricKeys, ...Object.keys(p.metrics ?? {})]);
    combinedKeys.forEach((key) => {
      metrics[key] = metricValueToString((p.metrics ?? {})[key]);
    });
    drafts[p.stage_index] = {
      pace: paceLabel(p.pace_seconds_per_km),
      lactate: p.lactate_mmol?.toString() ?? "",
      hr: p.hr_bpm?.toString() ?? "",
      rpe: p.rpe?.toString() ?? "",
      comments: p.comments ?? "",
      speed: p.speed_kmh?.toString() ?? "",
      metrics,
    };
  });
  return drafts;
};

const buildTakeaways = (points: LactatePoint[], lt1: ThresholdEstimate | null, lt2: ThresholdEstimate | null) => {
  if (!points.length) return ["Add more stages for better threshold estimates."];

  const takeaways: string[] = [];
  if (lt1?.hr_bpm) takeaways.push(`Stable lactate until ~LT1 HR (~${lt1.hr_bpm} bpm).`);
  if (lt2?.hr_bpm) takeaways.push(`Rapid rise near ~LT2 HR (~${lt2.hr_bpm} bpm).`);
  if (lt1?.hr_bpm) takeaways.push(`Easy running suggestion: stay below ~${lt1.hr_bpm - 5} bpm (LT1 - 5 bpm).`);

  const maxLactate = Math.max(...points.map((p) => Number(p.lactate_mmol) || 0));
  if (Number.isFinite(maxLactate) && maxLactate > 0) takeaways.push(`Max lactate recorded: ${maxLactate} mmol/L.`);

  const fastestPace = Math.min(...points.map((p) => p.pace_seconds_per_km || Number.POSITIVE_INFINITY));
  if (Number.isFinite(fastestPace)) takeaways.push(`Fastest pace logged: ${paceLabel(fastestPace)}.`);

  return takeaways.length ? takeaways.slice(0, 5) : ["Add more stages for better threshold estimates."];
};

const parseMetricsJson = (raw: string) => {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
};

const parseImportRows = (raw: string): { rows: ImportPointInput[]; errors: string[]; metricKeys: string[] } => {
  const rows: ImportPointInput[] = [];
  const errors: string[] = [];
  const metricKeys = new Set<string>();
  const trimmed = raw.trim();
  if (!trimmed) return { rows, errors: ["Paste rows with a header first."], metricKeys: [] };

  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    return { rows, errors: ["Include a header row and at least one data row."], metricKeys: [] };
  }

  const delimiter: string | RegExp = lines[0].includes(",") ? "," : lines[0].includes("\t") ? "\t" : /\s{2,}/;
  const headers = (typeof delimiter === "string" ? lines[0].split(delimiter) : lines[0].trim().split(/\s+/)).map((h) => h.trim());
  const normalizedHeaders = headers.map((h) => h.toLowerCase());
  const findIndex = (names: string[]) => normalizedHeaders.findIndex((h) => names.includes(h));

  const idxStage = findIndex(["stage", "stage_index", "stage #"]);
  const idxPace = findIndex(["pace", "pace_seconds", "pace (m:ss)", "pace (mm:ss)"]);
  const idxSpeed = findIndex(["speed", "speed_kmh", "speed (km/h)"]);
  const idxHr = findIndex(["hr", "heart rate", "heart_rate", "bpm"]);
  const idxLactate = findIndex(["lactate", "lactate_mmol", "lactate (mmol/l)"]);
  const idxRpe = findIndex(["rpe"]);
  const idxComments = findIndex(["comment", "comments", "notes"]);

  const metricHeaderIndexes = headers
    .map((_, i) => i)
    .filter((i) => ![idxStage, idxPace, idxSpeed, idxHr, idxLactate, idxRpe, idxComments].includes(i));
  metricHeaderIndexes.forEach((i) => metricKeys.add(headers[i] || normalizedHeaders[i]));

  if (idxPace === -1) errors.push("Header must include a Pace column (mm:ss).");
  if (idxLactate === -1) errors.push("Header must include a Lactate column.");
  if (errors.length) return { rows, errors, metricKeys: Array.from(metricKeys) };

  lines.slice(1).forEach((line, idx) => {
    const parts = (typeof delimiter === "string" ? line.split(delimiter) : line.trim().split(/\s+/)).map((p) => p.trim());
    const rowNumber = idx + 2; // account for header
    const rowErrors: string[] = [];

    const metrics: Record<string, unknown> = {};
    metricHeaderIndexes.forEach((i) => {
      const key = headers[i] || normalizedHeaders[i] || `metric_${i}`;
      const rawVal = parts[i] ?? "";
      if (rawVal) {
        const asNumber = Number(rawVal);
        metrics[key] = Number.isFinite(asNumber) ? asNumber : rawVal;
      }
    });
    const stageIndex = idxStage >= 0 ? Number(parts[idxStage]) : idx + 1;
    if (!Number.isFinite(stageIndex) || stageIndex < 0) rowErrors.push("Stage must be 0 or greater.");

    const paceSeconds = parsePaceInput(idxPace >= 0 ? parts[idxPace] : "");
    if (paceSeconds === null) rowErrors.push("Invalid pace (mm:ss).");

    const lactateRaw = parts[idxLactate];
    const lactateValue = Number(lactateRaw);
    if (!Number.isFinite(lactateValue)) rowErrors.push("Missing lactate value.");

    const hrValue = idxHr >= 0 && parts[idxHr] ? Number(parts[idxHr]) : null;
    const speedValue = idxSpeed >= 0 && parts[idxSpeed] ? Number(parts[idxSpeed]) : null;
    const rpeValue = idxRpe >= 0 && parts[idxRpe] ? Number(parts[idxRpe]) : null;
    const commentValue = idxComments >= 0 ? parts[idxComments] : undefined;

    if (rowErrors.length) {
      errors.push(`Row ${rowNumber}: ${rowErrors.join(" ")}`);
      return;
    }

    rows.push({
      stageIndex: Number(stageIndex),
      paceSecondsPerKm: paceSeconds ?? 0,
      lactateMmol: lactateValue,
      hrBpm: hrValue ?? null,
      speedKmh: speedValue ?? null,
      rpe: rpeValue ?? null,
      comments: commentValue || undefined,
      metrics: Object.keys(metrics).length ? metrics : undefined,
    });
  });

  return { rows, errors, metricKeys: Array.from(metricKeys) };
};

export function SessionDetail({ testId, protocol, initialPoints, initialNotes }: Props) {
  const [points, setPoints] = useState<LactatePoint[]>(normalizePoints(initialPoints));
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [form, setForm] = useState<FormState>({
    stageIndex: initialPoints[initialPoints.length - 1]?.stage_index ?? 0,
    pace: "",
    lactate: "",
    hr: "",
    rpe: "",
    comments: "",
    speed: "",
    cadence: "",
    metrics: "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [savingNotes, startSavingNotes] = useTransition();
  const [importing, startImporting] = useTransition();
  const [rowDrafts, setRowDrafts] = useState<Record<number, RowDraft>>({});
  const [importOpen, setImportOpen] = useState(false);
  const [importRaw, setImportRaw] = useState("");
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [metricKeyInput, setMetricKeyInput] = useState("");
  const [customMetricKeys, setCustomMetricKeys] = useState<string[]>([]);

  useEffect(() => {
    setPoints(normalizePoints(initialPoints));
  }, [initialPoints]);

  const metricsKeys = useMemo(() => {
    const keys = new Set<string>(customMetricKeys);
    points.forEach((p) => Object.keys(p.metrics ?? {}).forEach((k) => k && keys.add(k)));
    return Array.from(keys).sort();
  }, [points, customMetricKeys]);

  useEffect(() => {
    setRowDrafts(buildRowDrafts(points, metricsKeys));
  }, [points, metricsKeys]);

  const lt1 = useMemo(() => estimateLT1(points), [points]);
  const lt2 = useMemo(() => estimateLT2(points), [points]);
  const takeaways = useMemo(() => buildTakeaways(points, lt1, lt2), [points, lt1, lt2]);

  const summaryCards = useMemo(() => {
    const maxLactate = points.length ? Math.max(...points.map((p) => Number(p.lactate_mmol) || 0)) : null;
    const peakHr = points.length ? Math.max(...points.map((p) => (p.hr_bpm ? Number(p.hr_bpm) : -Infinity))) : null;
    const fastestPace = points.length ? Math.min(...points.map((p) => p.pace_seconds_per_km || Number.POSITIVE_INFINITY)) : null;

    return [
      {
        label: "Estimated LT1",
        value: `${lt1?.hr_bpm ? `${lt1.hr_bpm} bpm` : "--"} | ${paceLabel(lt1?.pace_seconds_per_km ?? null)}`,
        helper: lt1?.method ? lt1.method.replace(/-/g, " ") : "Needs HR + lactate",
      },
      {
        label: "Estimated LT2",
        value: `${lt2?.hr_bpm ? `${lt2.hr_bpm} bpm` : "--"} | ${paceLabel(lt2?.pace_seconds_per_km ?? null)}`,
        helper: lt2?.method ? lt2.method.replace(/-/g, " ") : "Needs HR + lactate",
      },
      { label: "Max lactate", value: maxLactate !== null && maxLactate !== -Infinity ? `${maxLactate} mmol/L` : "--" },
      { label: "Peak HR", value: peakHr && peakHr !== -Infinity ? `${peakHr} bpm` : "--" },
      { label: "Fastest pace", value: fastestPace && fastestPace !== Number.POSITIVE_INFINITY ? paceLabel(fastestPace) : "--" },
      { label: "Stages captured", value: `${points.length} / ${protocol.numStages}` },
    ];
  }, [lt1, lt2, points, protocol.numStages]);

  const mergeSavedPoint = (savedPoint: LactatePoint) => {
    const normalized = { ...savedPoint, metrics: savedPoint.metrics ?? {} };
    setPoints((prev) => {
      const filtered = prev.filter((p) => p.stage_index !== normalized.stage_index);
      return [...filtered, normalized].sort((a, b) => a.stage_index - b.stage_index);
    });
  };

  const parseMetricsForSubmit = () => {
    const metrics: Record<string, unknown> = {};
    if (form.cadence.trim()) {
      const cadenceValue = Number(form.cadence);
      if (!Number.isFinite(cadenceValue) || cadenceValue <= 0) {
        setError("Cadence must be a positive number.");
        return null;
      }
      metrics.cadence = cadenceValue;
    }
    if (form.metrics.trim()) {
      const parsed = parseMetricsJson(form.metrics);
      if (!parsed) {
        setError('Metrics must be valid JSON (e.g. {"cadence": 172}).');
        return null;
      }
      Object.assign(metrics, parsed);
    }
    return metrics;
  };

  const handleSavePoint = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);

    const stageIndex = Number(form.stageIndex);
    const paceSeconds = parsePaceInput(form.pace);
    const lactateValue = Number(form.lactate);
    const speedValue = form.speed ? Number(form.speed) : null;
    if (!Number.isFinite(stageIndex) || stageIndex < 0) {
      setError("Stage index must be 0 or greater (use 0 for baseline).");
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
    if (form.speed && !Number.isFinite(speedValue)) {
      setError("Speed must be a number (km/h).");
      return;
    }

    const metrics = parseMetricsForSubmit();
    if (metrics === null) return;

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
          speedKmh: speedValue ?? null,
          metrics: Object.keys(metrics ?? {}).length ? metrics ?? {} : undefined,
        });
        if (result.error) {
          setError(result.error);
          return;
        }
        const savedPoint = result.data;
        if (savedPoint) {
          mergeSavedPoint(savedPoint);
          setForm((prev) => ({
            ...prev,
            pace: "",
            lactate: "",
            hr: "",
            rpe: "",
            comments: "",
            speed: "",
            cadence: "",
            metrics: "",
            stageIndex: stageIndex + 1,
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

  const handleRowSave = (stageIndex: number) => {
    const draft = rowDrafts[stageIndex];
    if (!draft) return;
    setMessage(null);
    setError(null);
    const paceSeconds = parsePaceInput(draft.pace);
    const lactateValue = Number(draft.lactate);
    const speedValue = draft.speed ? Number(draft.speed) : null;

    if (paceSeconds === null) {
      setError(`Stage ${stageIndex}: invalid pace.`);
      return;
    }
    if (!Number.isFinite(lactateValue) || lactateValue <= 0) {
      setError(`Stage ${stageIndex}: lactate is required.`);
      return;
    }
    if (draft.speed && !Number.isFinite(speedValue)) {
      setError(`Stage ${stageIndex}: speed must be a number.`);
      return;
    }

    const metrics: Record<string, unknown> = {};
    metricsKeys.forEach((key) => {
      const raw = draft.metrics?.[key];
      if (raw && raw.trim()) {
        const asNumber = Number(raw);
        metrics[key] = Number.isFinite(asNumber) ? asNumber : raw;
      }
    });

    startSaving(() => {
      void (async () => {
        const result = await upsertPointAction({
          testId,
          stageIndex,
          paceSecondsPerKm: paceSeconds,
          lactateMmol: lactateValue,
          hrBpm: draft.hr ? Number(draft.hr) : null,
          rpe: draft.rpe ? Number(draft.rpe) : null,
          comments: draft.comments || undefined,
          speedKmh: speedValue ?? null,
          metrics: Object.keys(metrics).length ? metrics : undefined,
        });
        if (result.error) {
          setError(result.error);
          return;
        }
        const saved = result.data;
        if (saved) {
          mergeSavedPoint(saved);
          setMessage(`Updated stage ${stageIndex}.`);
        }
      })();
    });
  };

  const handleImport = () => {
    const { rows, errors, metricKeys: parsedMetricKeys } = parseImportRows(importRaw);
    setImportErrors(errors);
    if (errors.length) return;

    startImporting(() => {
      void (async () => {
        const result = await importPointsAction(testId, rows);
        if (result.error) {
          setImportErrors([result.error]);
          return;
        }
        if (result.data) {
          setPoints((prev) => {
            const map = new Map<number, LactatePoint>();
            [...prev, ...result.data.map((p) => ({ ...p, metrics: p.metrics ?? {} }))].forEach((p) => {
              map.set(p.stage_index, p);
            });
            return Array.from(map.values()).sort((a, b) => a.stage_index - b.stage_index);
          });
          setCustomMetricKeys((prev) => Array.from(new Set([...prev, ...parsedMetricKeys])));
          setMessage(`Imported ${rows.length} rows.`);
          setImportRaw("");
          setImportOpen(false);
          setImportErrors([]);
        }
      })();
    });
  };

  const addMetricColumn = () => {
    const key = metricKeyInput.trim();
    if (!key) return;
    setCustomMetricKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setMetricKeyInput("");
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        <div className="rounded-2xl bg-white/80 p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Coaching summary</p>
              <h3 className="text-2xl font-semibold text-slate-900">Threshold snapshot</h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setImportOpen(true)}
                className="rounded-full border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-500"
              >
                Paste results
              </button>
              <Link
                href={`/lactate/new?testId=${testId}`}
                className="rounded-full bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                Interactive mode (timed)
              </Link>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
            {summaryCards.map((card) => (
              <div
                key={card.label}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
              >
                <p className="text-xs uppercase tracking-wide text-slate-500">{card.label}</p>
                <p className="text-lg font-semibold text-slate-900">{card.value}</p>
                {card.helper ? <p className="text-xs text-slate-500">{card.helper}</p> : null}
              </div>
            ))}
          </div>
          {(message || error) && (
            <div className="mt-3 text-sm">
              {message ? <p className="text-emerald-700">{message}</p> : null}
              {error ? <p className="text-rose-700">{error}</p> : null}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-2xl bg-white/80 p-6 shadow-sm ring-1 ring-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">Lactate vs heart rate</h3>
            <p className="text-sm text-slate-600">Heart rate on X-axis, lactate on Y-axis. Faster paces show in tooltip.</p>
            <div className="mt-4 h-80">
              <LactateChart points={points} mode="hr" lt1Hr={lt1?.hr_bpm ?? null} lt2Hr={lt2?.hr_bpm ?? null} />
            </div>
          </div>
          <div className="rounded-2xl bg-white/80 p-6 shadow-sm ring-1 ring-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">Takeaways</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {takeaways.map((tip, idx) => (
                <li key={idx} className="flex gap-2">
                  <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="rounded-2xl bg-white/80 p-6 shadow-sm ring-1 ring-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">Add or update a stage</h3>
          <p className="text-sm text-slate-600">Stage 0 is a baseline sample. Metrics accept JSON for custom values (e.g. cadence).</p>
          <form onSubmit={handleSavePoint} className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Stage #
              <input
                type="number"
                min={0}
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
              Speed (km/h)
              <input
                type="number"
                min="0"
                step="0.1"
                value={form.speed}
                onChange={(e) => setForm((prev) => ({ ...prev, speed: e.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-inner outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                placeholder="Optional"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Cadence (spm)
              <input
                type="number"
                min="0"
                value={form.cadence}
                onChange={(e) => setForm((prev) => ({ ...prev, cadence: e.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-inner outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                placeholder="Optional metric"
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
            <label className="block text-sm font-medium text-slate-700">
              Metrics (JSON)
              <input
                type="text"
                value={form.metrics}
                onChange={(e) => setForm((prev) => ({ ...prev, metrics: e.target.value }))}
                placeholder='Optional. Example: {"cadence": 172}'
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-inner outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
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
                {saving ? "Saving..." : "Save / Update stage"}
              </button>
              {message && <span className="text-sm text-emerald-700">{message}</span>}
              {error && <span className="text-sm text-rose-700">{error}</span>}
            </div>
          </form>
        </div>

        <div className="rounded-2xl bg-white/80 p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Captured stages</h3>
              <p className="text-sm text-slate-600">{points.length} / {protocol.numStages} stages</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={metricKeyInput}
                onChange={(e) => setMetricKeyInput(e.target.value)}
                placeholder="Add metric column (e.g. cadence)"
                className="w-56 rounded-full border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
              />
              <button
                type="button"
                onClick={addMetricColumn}
                className="rounded-full border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-500"
              >
                Add column
              </button>
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="rounded-full bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                Paste results
              </button>
            </div>
          </div>
          {!points.length ? (
            <p className="mt-3 text-sm text-slate-600">No data yet. Add a stage above or paste results.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Stage</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Pace</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Speed (km/h)</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">HR</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Lactate</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">RPE</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Comments</th>
                    {metricsKeys.map((key) => (
                      <th key={key} className="px-3 py-2 text-left font-semibold text-slate-700 capitalize">{key}</th>
                    ))}
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {points.map((p) => {
                    const draft = rowDrafts[p.stage_index] ?? {
                      pace: paceLabel(p.pace_seconds_per_km),
                      lactate: p.lactate_mmol?.toString() ?? "",
                      hr: p.hr_bpm?.toString() ?? "",
                      rpe: p.rpe?.toString() ?? "",
                      comments: p.comments ?? "",
                      speed: p.speed_kmh?.toString() ?? "",
                      metrics: {},
                    };
                    return (
                      <tr key={p.stage_index} className="align-top">
                        <td className="px-3 py-2 font-semibold text-slate-800">{p.stage_index}</td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={draft.pace}
                            onChange={(e) =>
                              setRowDrafts((prev) => ({ ...prev, [p.stage_index]: { ...draft, pace: e.target.value } }))
                            }
                            className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-100"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={draft.speed}
                            onChange={(e) =>
                              setRowDrafts((prev) => ({ ...prev, [p.stage_index]: { ...draft, speed: e.target.value } }))
                            }
                            className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-100"
                            placeholder="km/h"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={draft.hr}
                            onChange={(e) =>
                              setRowDrafts((prev) => ({ ...prev, [p.stage_index]: { ...draft, hr: e.target.value } }))
                            }
                            className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-100"
                            placeholder="bpm"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={draft.lactate}
                            onChange={(e) =>
                              setRowDrafts((prev) => ({ ...prev, [p.stage_index]: { ...draft, lactate: e.target.value } }))
                            }
                            className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-100"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={draft.rpe}
                            onChange={(e) =>
                              setRowDrafts((prev) => ({ ...prev, [p.stage_index]: { ...draft, rpe: e.target.value } }))
                            }
                            className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-100"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={draft.comments}
                            onChange={(e) =>
                              setRowDrafts((prev) => ({ ...prev, [p.stage_index]: { ...draft, comments: e.target.value } }))
                            }
                            className="w-40 rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-100"
                            placeholder="Optional"
                          />
                        </td>
                        {metricsKeys.map((key) => (
                          <td key={key} className="px-3 py-2">
                            <input
                              type="text"
                              value={draft.metrics?.[key] ?? ""}
                              onChange={(e) =>
                                setRowDrafts((prev) => ({
                                  ...prev,
                                  [p.stage_index]: {
                                    ...draft,
                                    metrics: { ...draft.metrics, [key]: e.target.value },
                                  },
                                }))
                              }
                              className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-100"
                            />
                          </td>
                        ))}
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => handleRowSave(p.stage_index)}
                            className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                          >
                            Save
                          </button>
                        </td>
                      </tr>
                    );
                  })}
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

      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Import</p>
                <h3 className="text-xl font-semibold text-slate-900">Paste results</h3>
                <p className="text-sm text-slate-600">
                  Headers supported: pace, speed, HR, lactate, stage, RPE, comments, cadence (any extra columns saved into metrics).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImportOpen(false)}
                className="rounded-full border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
              >
                Close
              </button>
            </div>
            <textarea
              value={importRaw}
              onChange={(e) => setImportRaw(e.target.value)}
              rows={10}
              placeholder={"pace\tspeed\tHR\tLactate\n7:30\t8\t128\t1.4"}
              className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm text-slate-800 shadow-inner outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            />
            {importErrors.length ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-rose-700">
                {importErrors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-600">Tab-separated or CSV. Row order is used as stage order when no stage column is provided.</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setImportRaw("")}
                  className="rounded-full border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-500"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={importing}
                  className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {importing ? "Importing..." : "Import rows"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
