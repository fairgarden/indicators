'use client'

import { Link, useHref, useLocale, useSetLocale } from '@/lib/link'

/**
 * The locale of the page, and the two ways to choose another: a link into
 * it, or `useSetLocale`, which moves to this page in the other locale.
 * Both remember the choice in the `locale` cookie, which the site root
 * reads before the browser's own list.
 */
export function LocaleSwitcher() {
  const locale = useLocale()
  const setLocale = useSetLocale()
  const toHref = useHref()
  return (
    <>
      <div className="controls" role="group" aria-label="Locale">
        <button type="button" aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>
          en
        </button>
        <button type="button" aria-pressed={locale === 'en-GB'} onClick={() => setLocale('en-GB')}>
          en-GB
        </button>
      </div>
      <p>
        On this page, <code>&lt;Link href=&quot;/overview&quot;&gt;</code> renders{' '}
        <code>{toHref('/overview')}</code>, and with <code>locale=&quot;en-GB&quot;</code> it renders{' '}
        <code>{toHref('/overview', 'en-GB')}</code>:{' '}
        <Link href="/overview" locale="en-GB">
          the overview, in en-GB
        </Link>
        .
      </p>
    </>
  )
}
