'use client'

import { useParams, usePathname } from 'next/navigation'
import { useIndicators } from '@/lib/link'

/**
 * What the page was rendered for. `usePathname` is the public URL, the one
 * in the address bar; `useParams` holds the internal path the request was
 * rewritten to, which is where the locale, preferences and flags live.
 */
export function Inspector() {
  const { locale, prefs, flags } = useIndicators()
  const params = useParams<{ locale: string; prefs: string; flags: string }>()
  const pathname = usePathname()
  const { locale: l, prefs: p, flags: f } = params ?? {}
  const rest = pathname.replace(new RegExp(`^/${locale}(?=/|$)`), '') || '/'
  const internal = l && p && f ? `/${l}/${p}/${f}${rest === '/' ? '' : rest}` : '—'

  return (
    <dl className="inspector">
      <dt>Address bar</dt>
      <dd>{pathname}</dd>
      <dt>Rendered as</dt>
      <dd>{internal}</dd>
      <dt>Locale</dt>
      <dd>{locale}</dd>
      <dt>Preferences</dt>
      <dd>{JSON.stringify(prefs)}</dd>
      <dt>Flags</dt>
      <dd>{JSON.stringify(flags)}</dd>
    </dl>
  )
}
