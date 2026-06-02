type ThemePreference = "system" | "light" | "dark";
type EffectiveTheme = "light" | "dark";

const themes: ThemePreference[] = ["system", "light", "dark"];

export function applySavedTheme(): void {
  applyThemePreference(savedThemePreference());
}

export function currentTheme(): EffectiveTheme {
  return effectiveTheme(themePreference());
}

export function updateThemeToggle(button: Element | null): void {
  if (!button) return;
  const preference = themePreference();
  const effective = effectiveTheme(preference);
  button.textContent = preference === "system" ? "◐" : effective === "dark" ? "☼" : "☾";
  button.setAttribute("title", `Theme: ${preference}`);
  button.setAttribute("aria-label", `Theme: ${preference}. Click to change theme.`);
}

export function toggleTheme(button: Element | null): void {
  const current = themePreference();
  const next = themes[(themes.indexOf(current) + 1) % themes.length];
  applyThemePreference(next);
  localStorage.setItem("theme", next);
  updateThemeToggle(button);
}

function savedThemePreference(): ThemePreference {
  const savedTheme = localStorage.getItem("theme");
  return isThemePreference(savedTheme) ? savedTheme : "system";
}

function themePreference(): ThemePreference {
  const theme = document.documentElement.dataset.theme;
  return isThemePreference(theme) ? theme : "system";
}

function applyThemePreference(theme: ThemePreference): void {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

function effectiveTheme(theme: ThemePreference): EffectiveTheme {
  if (theme !== "system") return theme;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function isThemePreference(value: string | undefined | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}
