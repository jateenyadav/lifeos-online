import { Monitor, Moon, Sun } from 'lucide-react';
import { useThemeToggle } from './prefs.js';

export const themeIcons = { system: Monitor, light: Sun, dark: Moon };
export const themeNames = { system: 'System', light: 'Light', dark: 'Dark' };
const nextTheme = { system: 'light', light: 'dark', dark: 'system' };

/** One button that cycles System → Light → Dark. */
export default function ThemeToggle() {
  const [theme, cycle] = useThemeToggle();
  const Icon = themeIcons[theme] ?? Monitor;
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={`Theme: ${themeNames[theme]}. Switch to ${themeNames[nextTheme[theme]]}`}
      title={`Theme: ${themeNames[theme]}`}
      onClick={cycle}
    >
      <Icon size={18} />
    </button>
  );
}
