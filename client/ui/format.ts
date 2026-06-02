import type { TimeConfig } from "../types/domain.ts";

export function formatHms(seconds: number): string {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return [hours, minutes, secs].map((part) => String(part).padStart(2, "0")).join(":");
}

export function formatByoyomiTime(seconds: number): string {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return minutes > 0
    ? `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : String(secs).padStart(2, "0");
}

export function rulesText(ruleset: string): string {
  return ({
    chinese: "Chinese",
    aga: "AGA",
    japanese: "Japanese",
    area: "Area",
    territory: "Territory",
  } as Record<string, string>)[
    ruleset
  ] ?? ruleset;
}

export function formatMinutes(seconds: number): string {
  return `${Math.floor((Number(seconds) || 0) / 60)}m`;
}

export function timeSettingsText(time: TimeConfig | undefined): string {
  if (!time || time.system === "none") return "No time limit";
  if (time.system === "byoyomi") {
    return `Byo-yomi · Main ${formatMinutes(time.main ?? 0)} · ${time.periods ?? 0} × ${
      time.periodTime ?? 0
    }s`;
  }
  if (time.system === "fischer") {
    return `Fischer · Main ${formatMinutes(time.main ?? 0)} · +${time.fischerIncrement ?? 0}s`;
  }
  return "No time limit";
}

export function short(value: unknown): string {
  return String(value).slice(0, 8);
}

export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
