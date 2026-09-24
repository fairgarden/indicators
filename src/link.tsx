'use client'

import NextLink from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useMemo, type ComponentProps } from 'react'
import type { IndicatorsConfig } from './config.ts'
import { localizeHref, mountHref, type Href } from './hrefs.ts'
import type { Flags, Indicators, Locale, Prefs, Resolved } from './indicators.ts'

/**
 * Links and hooks that know which locale the page is in.
 *
 * The locale is a route param — `useParams().locale`, from the path the
 * request was rewritten to — so nothing has to be provided from a layout.
 * The config comes from the app's own `lib/indicators.ts`, which makes this
 * a factory: build the pieces once, in a client module, and export them.
 *
 * ```ts
 * // lib/link.ts
 * 'use client'
 * import { createNavigation } from '@fairgarden/indicators/link'
 * import { mountPrefix } from '@fairgarden/monolith/link'
 * import { indicators } from '@fairgarden/id/lib/indicators'
 *
 * export const { Link, useHref, useIndicators, usePref } = createNavigation(indicators, {
 *   mount: mountPrefix('@fairgarden/id'),
 * })
 * ```
 */

export interface NavigationOptions {
  /**
   * The prefix the app is mounted at inside a monolith, applied after the
   * locale: `/settings` in French becomes `/fr/settings`, then
   * `/id/fr/settings`. Pass `mountPrefix(packageName)` from
   * `@fairgarden/monolith/link`; it is `''` when the app runs on its own.
   */
  mount?: string
  /**
   * The path a cookie written through `usePref` is scoped to. Defaults to
   * `/`, so a preference set in one app of a monolith holds in all of them.
   */
  cookiePath?: string
}

type NextLinkProps = ComponentProps<typeof NextLink>

export type LinkProps<C extends IndicatorsConfig> = Omit<NextLinkProps, 'locale'> & {
  /** Link into another locale. Defaults to the one the page is in. */
  locale?: Locale<C>
}

export interface Navigation<C extends IndicatorsConfig> {
  /** A `next/link` whose hrefs carry the locale, and the mount when there is one. */
  Link: (props: LinkProps<C>) => React.JSX.Element
  /** The locale the page is in, or the default outside the locale tree. */
  useLocale: () => Locale<C>
  /** The locale, preferences and flags the page was rendered for. */
  useIndicators: () => Resolved<C>
  /**
   * A function building the href `Link` would, for `router.push` and
   * anywhere else a path ends up as a string.
   */
  useHref: () => <T extends Href>(href: T, locale?: Locale<C>) => T
  /**
   * A preference and a setter for it. Setting writes the cookie and
   * refreshes the route, so the next render is the matching variant;
   * `undefined` clears it. Only for a cookie-backed preference.
   */
  usePref: <K extends keyof Prefs<C> & string>(
    key: K
  ) => [Prefs<C>[K], (value: Prefs<C>[K] | undefined) => void]
}

const writeCookie = (
  name: string,
  value: string | undefined,
  maxAge: number,
  path: string
): void => {
  if (typeof document === 'undefined') return
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''
  const age = value === undefined ? 0 : maxAge
  document.cookie = `${name}=${value === undefined ? '' : encodeURIComponent(value)}; Path=${path}; Max-Age=${age}; SameSite=Lax${secure}`
}

export const createNavigation = <C extends IndicatorsConfig>(
  indicators: Indicators<C>,
  options: NavigationOptions = {}
): Navigation<C> => {
  const { config } = indicators
  const mount = options.mount ?? ''
  const cookiePath = options.cookiePath ?? '/'
  const asString = (value: string | string[] | undefined): string | undefined =>
    typeof value === 'string' ? value : undefined

  const useLocale = (): Locale<C> => {
    const params = useParams<Record<string, string | string[]>>()
    const locale = params?.locale
    return indicators.isLocale(locale) ? locale : indicators.defaultLocale
  }

  const useIndicators = (): Resolved<C> => {
    const params = useParams<Record<string, string | string[]>>()
    return useMemo(() => {
      const locale = params?.locale
      return {
        locale: indicators.isLocale(locale) ? locale : indicators.defaultLocale,
        prefs: (indicators.prefs.decode(asString(params?.prefs)) ?? {}) as Prefs<C>,
        flags: (indicators.flags.decode(asString(params?.flags)) ?? {}) as Flags<C>,
      }
    }, [params])
  }

  const useHref = () => {
    const current = useLocale()
    return useCallback(
      <T extends Href>(href: T, locale: Locale<C> = current): T =>
        mountHref(localizeHref(config, href, locale), mount),
      [current]
    )
  }

  const Link = ({ href, locale, ...props }: LinkProps<C>) => {
    const toHref = useHref()
    return <NextLink href={toHref(href, locale)} {...props} />
  }
  Link.displayName = 'IndicatorsLink'

  const usePref = <K extends keyof Prefs<C> & string>(
    key: K
  ): [Prefs<C>[K], (value: Prefs<C>[K] | undefined) => void] => {
    const { prefs } = useIndicators()
    const router = useRouter()
    const indicator = config.prefs.find((candidate) => candidate.key === key)

    const set = useCallback(
      (value: Prefs<C>[K] | undefined) => {
        if (!indicator || indicator.source.type !== 'cookie') {
          throw new Error(
            `usePref(${JSON.stringify(key)}): only a cookie-backed preference can be set from the client.`
          )
        }
        writeCookie(indicator.source.key, value as string | undefined, indicator.maxAge, cookiePath)
        router.refresh()
      },
      [indicator, key, router]
    )

    return [prefs[key], set]
  }

  return { Link, useLocale, useIndicators, useHref, usePref }
}

/** Just the `Link`, for an app that wants nothing else from `createNavigation`. */
export const createLink = <C extends IndicatorsConfig>(
  indicators: Indicators<C>,
  options: NavigationOptions = {}
): Navigation<C>['Link'] => createNavigation(indicators, options).Link
