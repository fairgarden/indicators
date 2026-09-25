import { mountHref } from './hrefs.ts'
import type { Stylesheet } from './indicators.ts'

export interface StylesheetsProps {
  /** The app's indicators; only `stylesheets()` is used. */
  indicators: { stylesheets: () => Stylesheet[] }
  /** The prefix the app is mounted at, from `mountPrefix` in `@fairgarden/monolith/link`. */
  mount?: string
  /**
   * The keys of the stylesheets to link. Left out, every global one, which
   * is what the root layout renders. A page names the ones declared
   * `global: false` that it uses.
   */
  only?: readonly string[]
}

/**
 * The `<link>` for every indicator expressed through a stylesheet. Render it
 * in the root layout's `<head>`, after the app's own styles, so what it sets
 * wins:
 *
 * ```tsx
 * <head>
 *   <Stylesheets indicators={indicators} mount={mountPrefix('@fairgarden/id')} />
 * </head>
 * ```
 *
 * A stylesheet declared `global: false` is left out there, and linked by
 * the pages that use it instead:
 *
 * ```tsx
 * <Stylesheets indicators={indicators} only={['os']} />
 * ```
 *
 * Such a page can arrive with a client-side navigation, so its links carry
 * a `precedence`: React hoists them into the `<head>` and holds the
 * navigation until they have loaded, and the page never shows unstyled.
 * React also leaves them there once the page is gone, so such a stylesheet
 * should style only what its page renders.
 *
 * The `data-indicators-stylesheet` attribute is how `usePref` finds the
 * link to fetch again after it writes the cookie.
 */
export const Stylesheets = ({ indicators, mount = '', only }: StylesheetsProps) => (
  <>
    {indicators
      .stylesheets()
      .filter((sheet) => (only ? only.includes(sheet.key) : sheet.global))
      .map((sheet) => (
        <link
          key={sheet.key}
          rel="stylesheet"
          href={mountHref(sheet.href, mount)}
          precedence={sheet.global ? undefined : 'indicators'}
          data-indicators-stylesheet={sheet.key}
        />
      ))}
  </>
)
