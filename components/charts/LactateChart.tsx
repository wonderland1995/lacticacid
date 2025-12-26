"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { type LactatePoint } from "@/lib/types";
import { formatPace } from "@/lib/utils";

type Props = {
  points: LactatePoint[];
};

export function LactateChart({ points }: Props) {
  if (!points.length) {
    return <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-600">No data yet</div>;
  }

  const sorted = [...points].sort((a, b) => a.pace_seconds_per_km - b.pace_seconds_per_km);
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
        <Tooltip
          contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0" }}
          formatter={(value, name) => {
            if (name === "pace") return [formatPace(Number(value)), "Pace"];
            if (name === "lactate") return [`${value} mmol/L`, "Lactate"];
            if (name === "hr") return [`${value} bpm`, "Heart rate"];
            if (name === "rpe") return [value, "RPE"];
            return [value, name];
          }}
          labelFormatter={(value, payload) => {
            const stage = payload?.[0]?.payload?.stage;
            const paceLabel = formatPace(Number(value));
            return stage ? `Stage ${stage} - ${paceLabel}` : paceLabel;
          }}
        />
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
