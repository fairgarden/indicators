import { Inspector } from '@/components/Inspector'
import { indicators } from '@/lib/indicators'

const NAMES: Record<string, string> = { fr: 'French', de: 'German', es: 'Spanish', ja: 'Japanese', zh: 'Chinese' }

export default indicators.page(({ flags }) => (
  <>
    <h1>Flags</h1>
    <p>
      A flag is a fact about the request. This one is what the browser asks for first in{' '}
      <code>Accept-Language</code>, lumped into a handful of names by a pattern each: <code>fr.*</code>{' '}
      is any header that starts with French.
    </p>
    <div className="panel">
      {flags.lang ? (
        <p>
          Your browser asks for <strong>{NAMES[flags.lang] ?? flags.lang}</strong> first. These docs are
          in English — but a page could use this to offer a translation, and it would do so from a
          static page, without reading a header.
        </p>
      ) : (
        <p>
          Your browser asks for English, or a language this site does not list, so the flag is not
          set. Change the browser&apos;s preferred language to French, German, Spanish, Japanese or
          Chinese and reload to see the other case.
        </p>
      )}
    </div>
    <h2>Rendered on demand</h2>
    <p>
      The flag is declared with <code>prerender: false</code>, so the build holds no copy of any
      page for it. The first visitor with a French browser has this page rendered for{' '}
      <code>lang~fr</code> and cached; the second gets a static page. The variant is the same
      canonical segment as a prerendered one, so nothing else differs.
    </p>
    <h2>Inspector</h2>
    <Inspector />
  </>
))
