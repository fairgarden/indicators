'use client'

import { useEffect, useState } from 'react'
import { usePref } from '@/lib/link'

const OPTIONS = ['blue', 'green', 'orange'] as const

/** What the stylesheet that was served says, read straight from CSS. */
const useAccentFromCss = () => {
  const [name, setName] = useState('')
  useEffect(() => {
    const read = () =>
      setName(
        getComputedStyle(document.documentElement)
          .getPropertyValue('--accent-name')
          .trim()
          .replace(/^"|"$/g, '')
      )
    read()
    // The stylesheet is fetched again after a change; poll briefly rather
    // than plumb an event through.
    const timer = setInterval(read, 250)
    return () => clearInterval(timer)
  }, [])
  return name
}

/**
 * Sets the `accent` preference, which lives in a stylesheet rather than the
 * path. Choosing writes the cookie and fetches `/theme/accent.css` again;
 * the page does not reload and no copy of it exists per accent.
 */
export function AccentPicker() {
  const [accent, setAccent] = usePref('accent')
  const served = useAccentFromCss()
  return (
    <>
      <div className="controls" role="group" aria-label="Accent">
        {OPTIONS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={accent === value}
            onClick={() => setAccent(value)}
          >
            {value}
          </button>
        ))}
        <button type="button" aria-pressed={accent === undefined} onClick={() => setAccent(undefined)}>
          default
        </button>
      </div>
      <p>
        <span className="swatch" /> The cookie says <code>{accent ?? 'nothing'}</code>; the CSS that
        was served says <code>--accent-name: {served || '…'}</code>.
      </p>
    </>
  )
}
