/** Theme setting (system §3): Dark is the app default, Light on request, Auto follows the OS. Stored per device. */
export const THEME_STORAGE_KEY = "orbit-theme";
export const DEFAULT_THEME = "dark";

export type ThemeChoice = "light" | "dark" | "system";

/**
 * Visible labels follow Orbit's Settings control; accessible names are Orbit's `aria-label`s. "Auto" keeps its visible
 * word in the name ("Auto, system theme") so the name contains the label (WCAG 2.5.3, axe label-content-name-mismatch);
 * it still matches the name "System theme".
 */
export const THEME_CHOICES: readonly { value: ThemeChoice; label: string; name: string }[] = [
  { value: "light", label: "Light", name: "Light theme" },
  { value: "dark", label: "Dark", name: "Dark theme" },
  { value: "system", label: "Auto", name: "Auto, system theme" },
];

/** The pressed choice for next-themes' `theme`; before hydration (undefined) or for an unknown value, the default. */
export function themeChoice(theme: string | undefined): ThemeChoice {
  return THEME_CHOICES.some((c) => c.value === theme) ? (theme as ThemeChoice) : DEFAULT_THEME;
}
