'use client'

import { usePref } from '@/lib/link'

const OPTIONS = [
  { value: undefined, label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const

/**
 * Sets the `theme` preference. The cookie decides which prerendered copy the
 * next request is rewritten to, so choosing refreshes the route: the page
 * that comes back already has `data-theme` on <html>, and the switch is
 * one attribute change, not a repaint through the wrong colors.
 */
export function ThemeToggle() {
  const [theme, setTheme] = usePref('theme')
  return (
    <div className="controls" role="group" aria-label="Theme">
      {OPTIONS.map(({ value, label }) => (
        <button
          key={label}
          type="button"
          aria-pressed={theme === value}
          onClick={() => setTheme(value)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
