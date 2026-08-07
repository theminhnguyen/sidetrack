import { useTheme } from '../lib/theme'

export function ThemeToggle() {
  const [theme, toggle] = useTheme()

  return (
    <button
      onClick={toggle}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className="overflow-hidden rounded-md border border-black/15 px-2.5 py-1.5 text-sm hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
    >
      {/* Keyed by theme so the icon actually swapping remounts this span and
          replays the spin-in — a plain emoji swap otherwise just snaps. */}
      <span key={theme} className="st-theme-spin inline-block">
        {theme === 'dark' ? '☀️' : '🌙'}
      </span>
    </button>
  )
}
