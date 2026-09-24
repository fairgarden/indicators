import { mountHref } from './hrefs.ts'
import type { Stylesheet } from './indicators.ts'

export interface StylesheetsProps {
  /** The app's indicators; only `stylesheets()` is used. */
  indicators: { stylesheets: () => Stylesheet[] }
  /** The prefix the app is mounted at, from `mountPrefix` in `@fairgarden/monolith/link`. */
  mount?: string
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
 * The `data-indicators-stylesheet` attribute is how `usePref` finds the
 * link to fetch again after it writes the cookie.
 */
export const Stylesheets = ({ indicators, mount = '' }: StylesheetsProps) => (
  <>
    {indicators.stylesheets().map((sheet) => (
      <link
        key={sheet.key}
        rel="stylesheet"
        href={mountHref(sheet.href, mount)}
        data-indicators-stylesheet={sheet.key}
      />
    ))}
  </>
)
