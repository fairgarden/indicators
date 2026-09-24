'use client'

import NextLink from 'next/link'
import { useParams, usePathname, useRouter } from 'next/navigation'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type MouseEvent,
} from 'react'
import { ONE_YEAR, type IndicatorsConfig, type NormalizedValue } from './config.ts'
import { localizeHref, mountHref, splitLocale, type Href } from './hrefs.ts'
import type {
  CurrentLocale,
  Flags,
  Indicators,
  Locale,
  PrefKey,
  Prefs,
  PrefValue,
  Resolved,
} from './indicators.ts'

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
 *
 * A locale the user picks — a `Link` with a `locale` prop they follow, or a
 * call to `useSetLocale` — is remembered in the locale cookie, which is what
 * the proxy at the site root reads before the browser's own list.
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
  /**
   * Link into another locale. Defaults to the one the page is in. Given
   * explicitly, following the link also remembers the locale as the user's
   * choice, unless `remember` is false.
   */
  locale?: Locale<C>
  /**
   * Whether following a link with a `locale` records that locale as the
   * user's preference. Defaults to true: a link the user picks a language
   * with is a choice. Set false for a link that merely crosses locales — to
   * a page that exists in one locale only, say — which is not.
   */
  remember?: boolean
}

export interface Navigation<C extends IndicatorsConfig> {
  /** A `next/link` whose hrefs carry the locale, and the mount when there is one. */
  Link: (props: LinkProps<C>) => React.JSX.Element
  /**
   * The locale the page is in, or the default outside the locale tree;
   * undefined for a site in one language.
   */
  useLocale: () => CurrentLocale<C>
  /**
   * A function that moves to the current page in another locale, and
   * remembers the choice in the locale cookie, so the site root sends the
   * user there next time.
   */
  useSetLocale: () => (locale: Locale<C>) => void
  /** The locale, preferences and flags the page was rendered for. */
  useIndicators: () => Resolved<C>
  /**
   * A function building the href `Link` would, for `router.push` and
   * anywhere else a path ends up as a string.
   */
  useHref: () => <T extends Href>(href: T, locale?: Locale<C>) => T
  /**
   * A preference and a setter for it. Setting writes the cookie; for a
   * preference in the path it then refreshes the route, so the next render
   * is the matching variant, and for one expressed through a stylesheet it
   * fetches that stylesheet again, so the change shows without a reload.
   * `undefined` clears it. Only for a cookie-backed preference.
   *
   * A preference in the path is known on the server and on the first
   * render. One expressed through a stylesheet is read from the cookie
   * after mounting, so it is `undefined` on the server and until then.
   */
  usePref: <K extends PrefKey<C>>(
    key: K
  ) => [PrefValue<C, K> | undefined, (value: PrefValue<C, K> | undefined) => void]
}

const readCookie = (name: string): string | undefined => {
  if (typeof document === 'undefined') return undefined
  for (const part of document.cookie.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return undefined
}

/** The value name a raw cookie stands for, by the indicator's patterns. */
const nameOf = (values: NormalizedValue[], raw: string | undefined): string | undefined =>
  raw === undefined
    ? undefined
    : values.find((value) => new RegExp(`^(?:${value.pattern})$`).test(raw))?.name

/**
 * Fetch a stylesheet again, so a changed cookie shows without a reload: a
 * fresh link after the current ones, and the earlier fresh ones removed once
 * it has loaded. The first link is the layout's and stays; the fresh one
 * comes later in the document, so what it sets wins.
 */
const reloadStylesheet = (key: string): void => {
  if (typeof document === 'undefined') return
  const links = [
    ...document.querySelectorAll<HTMLLinkElement>(
      `link[rel="stylesheet"][data-indicators-stylesheet="${key}"]`
    ),
  ]
  const last = links[links.length - 1]
  if (!last) return

  const fresh = document.createElement('link')
  fresh.rel = 'stylesheet'
  fresh.dataset.indicatorsStylesheet = key
  const url = new URL(last.href)
  url.searchParams.set('v', String(Date.now()))
  fresh.href = url.toString()
  fresh.addEventListener('load', () => {
    for (const old of links.slice(1)) old.remove()
  })
  last.after(fresh)
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

  const useLocale = (): CurrentLocale<C> => {
    const params = useParams<Record<string, string | string[]>>()
    const locale = params?.locale
    return (indicators.isLocale(locale) ? locale : indicators.defaultLocale) as CurrentLocale<C>
  }

  const useIndicators = (): Resolved<C> => {
    const params = useParams<Record<string, string | string[]>>()
    return useMemo(() => {
      const locale = params?.locale
      return {
        locale: (indicators.isLocale(locale)
          ? locale
          : indicators.defaultLocale) as CurrentLocale<C>,
        prefs: (indicators.prefs.decode(asString(params?.prefs)) ?? {}) as Prefs<C>,
        flags: (indicators.flags.decode(asString(params?.flags)) ?? {}) as Flags<C>,
      }
    }, [params])
  }

  const useHref = () => {
    const current = useLocale()
    return useCallback(
      <T extends Href>(href: T, locale: Locale<C> | undefined = current): T =>
        mountHref(localizeHref(config, href, locale), mount),
      [current]
    )
  }

  /** Record a locale the user chose, when the config keeps a cookie for it. */
  const rememberLocale = (locale: Locale<C>): void => {
    if (config.localeCookie) writeCookie(config.localeCookie, locale, ONE_YEAR, cookiePath)
  }

  const Link = ({ href, locale, remember = true, onClick, ...props }: LinkProps<C>) => {
    const toHref = useHref()
    const choose = useCallback(
      (event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event)
        if (locale !== undefined && !event.defaultPrevented) rememberLocale(locale)
      },
      [locale, onClick]
    )
    return (
      <NextLink
        href={toHref(href, locale)}
        onClick={locale === undefined || !remember ? onClick : choose}
        {...props}
      />
    )
  }
  Link.displayName = 'IndicatorsLink'

  const useSetLocale = () => {
    const router = useRouter()
    const pathname = usePathname()
    const toHref = useHref()
    return useCallback(
      (locale: Locale<C>) => {
        if (config.locales.length === 0) {
          throw new Error('useSetLocale: this site has no locales.')
        }
        rememberLocale(locale)
        // `usePathname` is the public URL: the mount, the locale prefix if
        // any, and the page. Keep the page, and let the href carry the rest.
        const current = pathname ?? '/'
        const unmounted =
          mount && (current === mount || current.startsWith(`${mount}/`))
            ? current.slice(mount.length) || '/'
            : current
        const { pathname: page } = splitLocale(config, unmounted)
        const rest = typeof location === 'undefined' ? '' : `${location.search}${location.hash}`
        router.push(toHref(`${page}${rest}`, locale))
      },
      [pathname, router, toHref]
    )
  }

  const usePref = <K extends PrefKey<C>>(
    key: K
  ): [PrefValue<C, K> | undefined, (value: PrefValue<C, K> | undefined) => void] => {
    const { prefs } = useIndicators()
    const router = useRouter()
    const inPath = config.prefs.find((candidate) => candidate.key === key)
    const sheet = config.stylesheets.find(
      (candidate) => candidate.kind === 'prefs' && candidate.key === key
    )
    const indicator = sheet ?? inPath

    // A stylesheet preference is not in the params; the cookie is all there is.
    const [fromCookie, setFromCookie] = useState<string | undefined>(undefined)
    useEffect(() => {
      if (sheet) setFromCookie(nameOf(sheet.values, readCookie(sheet.source.key)))
    }, [sheet])

    const set = useCallback(
      (value: PrefValue<C, K> | undefined) => {
        if (!indicator || indicator.source.type !== 'cookie') {
          throw new Error(
            `usePref(${JSON.stringify(key)}): only a cookie-backed preference can be set from the client.`
          )
        }
        writeCookie(indicator.source.key, value as string | undefined, indicator.maxAge, cookiePath)
        if (sheet) {
          setFromCookie(value as string | undefined)
          reloadStylesheet(sheet.key)
        } else {
          router.refresh()
        }
      },
      [indicator, sheet, key, router]
    )

    const current = sheet
      ? fromCookie
      : (prefs as Record<string, string | undefined>)[key]
    return [current as PrefValue<C, K> | undefined, set]
  }

  return { Link, useLocale, useSetLocale, useIndicators, useHref, usePref }
}

/** Just the `Link`, for an app that wants nothing else from `createNavigation`. */
export const createLink = <C extends IndicatorsConfig>(
  indicators: Indicators<C>,
  options: NavigationOptions = {}
): Navigation<C>['Link'] => createNavigation(indicators, options).Link
