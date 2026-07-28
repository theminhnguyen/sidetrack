import { useTheme } from '../lib/theme'

export function ThemeToggle() {
  const [theme, toggle] = useTheme()

  return (
    <button
      onClick={toggle}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className="rounded-md border border-black/15 px-2.5 py-1.5 text-sm hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  )
}
