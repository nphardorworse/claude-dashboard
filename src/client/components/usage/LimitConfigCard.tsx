import { useState, useCallback, useEffect, useMemo } from "react";
import type { PlanLimits } from "../../../shared/types";
import { PLAN_PRESETS } from "../../../shared/plan-presets";
import { useToast } from "../shared/Toast";

type LimitConfigCardProps = {
  limits: PlanLimits;
  isLoading: boolean;
  onSave: (limits: PlanLimits) => Promise<void>;
};

const parseLimitInput = (raw: string): number | null => {
  if (!raw.trim()) return null;
  const num = Number(raw);
  if (Number.isNaN(num) || num <= 0) return null;
  return Math.round(num);
};

const formatLimitForInput = (val: number | null): string => {
  if (val == null) return "";
  return String(val);
};

const formatTimeForInput = (time: string | null): string => {
  if (!time) return "";
  return time;
};

const parseTimeInput = (val: string): string | null => {
  if (!val.trim()) return null;
  const parts = val.split(":");
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const formatDatetimeForInput = (iso: string | null): string => {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
};

const parseDatetimeInput = (val: string): string | null => {
  if (!val.trim()) return null;
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
};

export const LimitConfigCard = ({ limits, isLoading, onSave }: LimitConfigCardProps) => {
  const { toast } = useToast();
  const [sessionMsgDraft, setSessionMsgDraft] = useState("");
  const [weeklyMsgDraft, setWeeklyMsgDraft] = useState("");
  const [sessionResetsDraft, setSessionResetsDraft] = useState("");
  const [weeklyResetsDraft, setWeeklyResetsDraft] = useState("");

  useEffect(() => {
    setSessionMsgDraft(formatLimitForInput(limits.sessionMessageLimit));
    setWeeklyMsgDraft(formatLimitForInput(limits.weeklyMessageLimit));
    setSessionResetsDraft(formatTimeForInput(limits.sessionResetsAt));
    setWeeklyResetsDraft(formatDatetimeForInput(limits.weeklyResetsAt));
  }, [limits]);

  const handleSessionMsgChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSessionMsgDraft(e.target.value);
  }, []);

  const handleWeeklyMsgChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setWeeklyMsgDraft(e.target.value);
  }, []);

  const handleSessionResetsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSessionResetsDraft(e.target.value);
  }, []);

  const handleWeeklyResetsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setWeeklyResetsDraft(e.target.value);
  }, []);

  const handlePresetSelect = useCallback((sessionLimit: number) => {
    setSessionMsgDraft(String(sessionLimit));
  }, []);

  const handleSave = useCallback(async () => {
    const next: PlanLimits = {
      sessionMessageLimit: parseLimitInput(sessionMsgDraft),
      weeklyMessageLimit: parseLimitInput(weeklyMsgDraft),
      sessionResetsAt: parseTimeInput(sessionResetsDraft),
      weeklyResetsAt: parseDatetimeInput(weeklyResetsDraft),
    };
    try {
      await onSave(next);
      toast("Limits saved", "success");
    } catch {
      toast("Failed to save limits", "error");
    }
  }, [sessionMsgDraft, weeklyMsgDraft, sessionResetsDraft, weeklyResetsDraft, onSave, toast]);

  const handleClear = useCallback(async () => {
    setSessionMsgDraft("");
    setWeeklyMsgDraft("");
    setSessionResetsDraft("");
    setWeeklyResetsDraft("");
    try {
      await onSave({ sessionMessageLimit: null, weeklyMessageLimit: null, sessionResetsAt: null, weeklyResetsAt: null });
      toast("Limits cleared", "info");
    } catch {
      toast("Failed to clear limits", "error");
    }
  }, [onSave, toast]);

  const activePresetId = useMemo(() => {
    const val = parseLimitInput(sessionMsgDraft);
    if (val == null) return null;
    const match = PLAN_PRESETS.find((p) => p.sessionMessageLimit === val);
    return match?.id ?? null;
  }, [sessionMsgDraft]);

  const presetButtons = useMemo(
    () =>
      PLAN_PRESETS.map((preset) => (
        <PresetButton
          key={preset.id}
          preset={preset}
          isActive={activePresetId === preset.id}
          onSelect={handlePresetSelect}
        />
      )),
    [activePresetId, handlePresetSelect]
  );

  if (isLoading) return null;

  return (
    <div className="rounded-2xl bg-[var(--overlay-faint)] p-[1px] ring-1 ring-[var(--border-hairline)]">
      <div className="rounded-[calc(1rem-1px)] bg-[var(--surface-raised)] p-5 shadow-[inset_0_1px_1px_var(--glow-inset)]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
          Configure Limits
        </p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
          Anthropic rate-limits on messages (user turns), not tokens. Pick your plan to pre-fill, or set a custom limit.
        </p>

        {/* Plan preset selector */}
        <div className="mt-3 flex flex-wrap gap-2">
          {presetButtons}
        </div>

        {/* Message limits */}
        <div className="mt-4 flex flex-col gap-3">
          <LimitInput
            label="Session limit"
            type="number"
            value={sessionMsgDraft}
            placeholder="225"
            onChange={handleSessionMsgChange}
            suffix="messages / 5hr"
          />
          <LimitInput
            label="Weekly limit"
            type="number"
            value={weeklyMsgDraft}
            placeholder="optional"
            onChange={handleWeeklyMsgChange}
            suffix="messages / week"
          />
        </div>

        {/* Reset time inputs */}
        <div className="mt-4 border-t border-[var(--border-hairline)] pt-4">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
            Window Reset Times
          </p>
          <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">
            In Claude Code, run{" "}
            <code className="rounded bg-[var(--overlay-subtle)] px-1 py-0.5 text-[10px] text-zinc-400">/usage</code>
            {" "}to see when your windows reset. Enter those values below — they auto-advance so you only need to set them once.
          </p>
          <div className="flex flex-col gap-3">
            <LimitInput
              label="Session resets at"
              type="time"
              value={sessionResetsDraft}
              placeholder=""
              onChange={handleSessionResetsChange}
              suffix="recurs daily"
            />
            <LimitInput
              label="Weekly resets at"
              type="datetime-local"
              value={weeklyResetsDraft}
              placeholder=""
              onChange={handleWeeklyResetsChange}
              suffix="recurs +7d"
            />
          </div>
        </div>

        {/* Buttons */}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={handleClear}
            className="rounded-lg px-3 py-1.5 text-[11px] font-medium text-zinc-500 transition-snappy hover:bg-[var(--overlay-subtle)] hover:text-zinc-300"
          >
            Clear
          </button>
          <button
            onClick={handleSave}
            className="rounded-lg bg-blue-500/20 px-3 py-1.5 text-[11px] font-medium text-blue-400 ring-1 ring-blue-500/30 transition-snappy hover:bg-blue-500/30"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

/* ─── Plan preset button ────────────────────── */

type PresetButtonProps = {
  preset: { id: string; label: string; price: string; sessionMessageLimit: number; multiplier: string };
  isActive: boolean;
  onSelect: (limit: number) => void;
};

const PresetButton = ({ preset, isActive, onSelect }: PresetButtonProps) => {
  const handleClick = useCallback(() => {
    onSelect(preset.sessionMessageLimit);
  }, [preset.sessionMessageLimit, onSelect]);

  return (
    <button
      onClick={handleClick}
      className={`flex flex-col items-start rounded-lg border px-3 py-2 text-left transition-snappy ${
        isActive
          ? "border-blue-500/40 bg-blue-500/10 text-blue-400"
          : "border-[var(--border-hairline)] bg-[var(--overlay-faint)] text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
      }`}
    >
      <span className="text-[11px] font-semibold">{preset.label}</span>
      <span className="text-[9px] text-zinc-500">{preset.price} · {preset.multiplier}</span>
      <span className="mt-0.5 font-mono text-[10px]">~{preset.sessionMessageLimit} msg/5hr</span>
    </button>
  );
};

/* ─── Input row ─────────────────────────────── */

type LimitInputProps = {
  label: string;
  type: "number" | "datetime-local" | "time";
  value: string;
  placeholder: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  suffix?: string;
};

const LimitInput = ({ label, type, value, placeholder, onChange, suffix }: LimitInputProps) => (
  <div className="flex items-center gap-3">
    <label className="w-40 shrink-0 text-[11px] font-medium text-zinc-400">
      {label}
    </label>
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={onChange}
      className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--overlay-faint)] px-3 py-1.5 font-mono text-[12px] text-zinc-200 outline-none transition-snappy placeholder:text-zinc-500 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
    />
    {suffix && (
      <span className="shrink-0 text-[10px] text-zinc-500">{suffix}</span>
    )}
  </div>
);
