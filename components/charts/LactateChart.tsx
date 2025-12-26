"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
  XAxis,
  YAxis,
} from "recharts";
import { type LactatePoint } from "@/lib/types";
import { formatPace } from "@/lib/utils";

type Props = {
  points: LactatePoint[];
  mode?: "pace" | "hr";
  lt1Hr?: number | null;
  lt2Hr?: number | null;
};

type ChartPointPayload = {
  hr?: number | null;
  lactate?: number;
  pace?: number;
  speed?: number | null;
  stage?: number;
  metrics?: Record<string, unknown>;
};

type ChartTooltipProps = TooltipProps<number, string> & { payload?: ReadonlyArray<{ payload: ChartPointPayload }> };

export function LactateChart({ points, mode = "pace", lt1Hr, lt2Hr }: Props) {
  const normalized = points.map((p) => ({ ...p, metrics: p.metrics ?? {} }));
  if (!normalized.length) {
    return <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-600">No data yet</div>;
  }

  const tooltipContent = (props: ChartTooltipProps) => {
    const { active, payload } = props;
    if (!active || !payload?.length) return null;
    const item = payload[0]?.payload;
    if (!item) return null;
    const metrics = item.metrics ?? {};
    const metricEntries = Object.entries(metrics);
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-lg shadow-slate-200/50">
        <div className="flex items-center justify-between gap-3">
          <p className="font-semibold text-slate-900">Stage {item.stage}</p>
          <p className="text-xs text-slate-500">{item.hr ? `${item.hr} bpm` : "HR --"}</p>
        </div>
        <p className="text-slate-700">Lactate: <span className="font-semibold">{item.lactate} mmol/L</span></p>
        <p className="text-slate-700">Pace: <span className="font-semibold">{formatPace(Number(item.pace)).replace("/km", "")}</span></p>
        <p className="text-slate-700">Speed: <span className="font-semibold">{item.speed ? `${item.speed} km/h` : "--"}</span></p>
        {metricEntries.length ? (
          <div className="mt-2 space-y-1">
            {metricEntries.map(([key, value]) => (
              <p key={key} className="text-slate-600">
                {key}: <span className="font-semibold text-slate-900">{String(value)}</span>
              </p>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  if (mode === "hr") {
    const withHr = normalized.filter((p) => typeof p.hr_bpm === "number" && Number.isFinite(p.hr_bpm));
    if (!withHr.length) {
      return <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 px-4 text-sm text-slate-600">Add heart rate data to view HR vs lactate.</div>;
    }
    const sorted = [...withHr].sort((a, b) => (a.hr_bpm ?? 0) - (b.hr_bpm ?? 0));
    const hrValues = sorted.map((p) => Number(p.hr_bpm));
    const minHr = Math.min(...hrValues);
    const maxHr = Math.max(...hrValues);
    const domain: [number, number] = [Math.max(0, minHr - 5), maxHr + 5];
    const data = sorted.map((p) => ({
      hr: p.hr_bpm,
      lactate: Number(p.lactate_mmol),
      pace: p.pace_seconds_per_km,
      speed: p.speed_kmh ?? null,
      stage: p.stage_index,
      metrics: p.metrics ?? {},
    }));

    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, left: 4, right: 20, bottom: 14 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="hr"
            type="number"
            domain={domain}
            tickFormatter={(v) => `${v} bpm`}
            label={{ value: "Heart rate (bpm)", position: "insideBottom", offset: -5 }}
          />
          <YAxis
            domain={["auto", "auto"]}
            tickFormatter={(v) => `${v}`}
            label={{ value: "Lactate (mmol/L)", angle: -90, position: "insideLeft" }}
          />
          {lt1Hr ? <ReferenceLine x={lt1Hr} stroke="#0ea5e9" strokeDasharray="4 4" label={{ value: "LT1", position: "top", fill: "#0ea5e9" }} /> : null}
          {lt2Hr ? <ReferenceLine x={lt2Hr} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "LT2", position: "top", fill: "#ef4444" }} /> : null}
          <Tooltip content={tooltipContent} />
          <Legend />
          <Line
            type="monotone"
            dataKey="lactate"
            stroke="#0f172a"
            strokeWidth={3}
            dot={{ r: 5, fill: "#0f172a" }}
            name="Lactate"
          />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  const sorted = [...normalized].sort((a, b) => a.pace_seconds_per_km - b.pace_seconds_per_km);
  const hasHr = sorted.some((p) => p.hr_bpm);
  const paceValues = sorted.map((p) => p.pace_seconds_per_km);
  const domain: [number, number] = [
    Math.max(...paceValues) + 5,
    Math.max(Math.min(...paceValues) - 5, 0),
  ];

  const data = sorted.map((p) => ({
    pace: p.pace_seconds_per_km,
    lactate: Number(p.lactate_mmol),
    hr: p.hr_bpm,
    stage: p.stage_index,
    rpe: p.rpe,
    speed: p.speed_kmh ?? null,
    metrics: p.metrics ?? {},
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 10, left: 0, right: 20, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="pace"
          type="number"
          domain={domain}
          reversed
          tickFormatter={(v) => formatPace(Number(v)).replace("/km", "")}
          label={{ value: "Pace (mm:ss per km - faster to the right)", position: "insideBottom", offset: -5 }}
        />
        <YAxis
          yAxisId="lactate"
          domain={["auto", "auto"]}
          tickFormatter={(v) => `${v}`}
          label={{ value: "Lactate (mmol/L)", angle: -90, position: "insideLeft" }}
        />
        {hasHr && (
          <YAxis
            yAxisId="hr"
            orientation="right"
            domain={["auto", "auto"]}
            tickFormatter={(v) => `${v} bpm`}
            label={{ value: "Heart rate", angle: 90, position: "insideRight" }}
          />
        )}
        <Tooltip content={tooltipContent} />
        <Legend />
        <Line
          type="monotone"
          dataKey="lactate"
          stroke="#0f172a"
          strokeWidth={3}
          dot={{ r: 5, fill: "#0f172a" }}
          name="Lactate"
          yAxisId="lactate"
        />
        {hasHr && (
          <Line
            type="monotone"
            dataKey="hr"
            stroke="#f97316"
            strokeWidth={2}
            dot={{ r: 4, fill: "#fb923c" }}
            name="Heart rate"
            yAxisId="hr"
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
