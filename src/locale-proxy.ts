import { NextResponse, type NextRequest } from 'next/server'
import type { NormalizedConfig } from './config.ts'

/**
 * Language detection, at the site root only.
 *
 * (Not named `proxy.ts`: Next takes any file of that name near a project
 * for the project's own proxy, and a docs site beside this package would
 * fail to build.)
 *
 * Everything else is a rewrite: `/login` is the default locale's login page
 * and `/fr/login` is French, whatever the browser says, so those URLs mean
 * one thing and cache as one thing. The root is the exception — a visitor who
 * types the domain has not chosen a locale yet — and negotiation from
 * `Accept-Language` is the one thing a rewrite cannot express, so it takes a
 * proxy. The proxy matches nothing but the root, so no other request pays
 * for it.
 *
 * A visitor the default locale suits goes on to the rewrites untouched; one
 * that another locale suits is redirected to it, from where every link
 * carries the locale. The locale cookie — a choice the user made, remembered
 * by `Link` and `useSetLocale` — wins over the header.
 */

export interface ProxyOptions {
  /**
   * Where the app is mounted. `/id` when a monolith serves it there; the
   * default is the site root. The proxy then matches `/id`, and a monolith
   * lists each of its apps here rather than each app shipping a proxy of
   * its own.
   */
  mount?: string
}

/**
 * What the proxy needs from an app's indicators. Structural, so an
 * `Indicators` whose locales are typed as literals is accepted as it is.
 */
export interface ProxyApp {
  config: NormalizedConfig
  isLocale: (value: unknown) => value is string
  negotiate: (acceptLanguage: string | null | undefined) => string
}

/** Mount prefix -> the indicators of the app served there. */
export type Mounts = Record<string, ProxyApp>

export interface LocaleProxy {
  (request: NextRequest): NextResponse
  /**
   * The paths this proxy acts on: the root of every app it was given. Export
   * `config = { matcher: [...] }` with these written out, since Next reads a
   * matcher from the source at build time and ignores a computed one — and
   * without a matcher the proxy would run for every request.
   */
  matcher: string[]
}

const normalizeMount = (mount: string): string => (mount === '/' ? '' : mount.replace(/\/$/, ''))

const isIndicators = (value: ProxyApp | Mounts): value is ProxyApp =>
  'config' in value && 'negotiate' in value && typeof value.negotiate === 'function'

/**
 * A `proxy.ts` that negotiates the locale at the site root.
 *
 * ```ts
 * // proxy.ts
 * export const proxy = createLocaleProxy(indicators)
 * export const config = { matcher: ['/'] }
 * ```
 *
 * A monolith gives it every app it serves, keyed by mount:
 *
 * ```ts
 * export const proxy = createLocaleProxy({ '/': www, '/id': id })
 * export const config = { matcher: ['/', '/id'] }
 * ```
 */
export const createLocaleProxy = (
  indicators: ProxyApp | Mounts,
  options: ProxyOptions = {}
): LocaleProxy => {
  const mounts: Array<[string, ProxyApp]> = isIndicators(indicators)
    ? [[normalizeMount(options.mount ?? ''), indicators]]
    : Object.entries(indicators).map(([mount, app]) => [normalizeMount(mount), app])

  if (mounts.length === 0) throw new Error('createLocaleProxy needs at least one app.')

  const proxy = (request: NextRequest): NextResponse => {
    const { pathname } = request.nextUrl
    const found = mounts.find(([mount]) => pathname === (mount || '/'))
    if (!found) return NextResponse.next()

    const [mount, app] = found
    const { config } = app

    const chosen = config.localeCookie
      ? request.cookies.get(config.localeCookie)?.value
      : undefined
    const locale = app.isLocale(chosen)
      ? chosen
      : app.negotiate(request.headers.get('accept-language'))

    // The page Next renders after this carries Next's own `Vary`, whatever is
    // set here; only the redirect can say what it depended on.
    if (locale === config.defaultLocale && config.localePrefix === 'as-needed') {
      return NextResponse.next()
    }

    const url = request.nextUrl.clone()
    url.pathname = `${mount}/${locale}`
    return NextResponse.redirect(url, {
      status: 307,
      headers: { vary: 'Accept-Language, Cookie' },
    })
  }

  return Object.assign(proxy, { matcher: mounts.map(([mount]) => mount || '/') })
}
