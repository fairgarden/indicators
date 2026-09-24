import type { NormalizedConfig } from './config.ts'

/**
 * The shape of a `next/link` href, without depending on Next to say so.
 * `pathname` is nullable because Next's own `UrlObject` allows it.
 */
export type Href = string | { pathname?: string | null | undefined }

/** Where a path's query or fragment starts, or its length when it has neither. */
const pathEnd = (href: string): number => {
  const query = href.indexOf('?')
  const hash = href.indexOf('#')
  if (query === -1) return hash === -1 ? href.length : hash
  if (hash === -1) return query
  return Math.min(query, hash)
}

const firstSegment = (pathname: string): string => pathname.split('/')[1] ?? ''

/** The locale a path starts with, if any, and the path without it. */
export const splitLocale = (
  config: NormalizedConfig,
  pathname: string
): { locale: string | undefined; pathname: string } => {
  const segment = firstSegment(pathname)
  const locale = config.locales.find((candidate) => candidate === segment)
  if (!locale) return { locale: undefined, pathname }
  const rest = pathname.slice(locale.length + 1)
  return { locale, pathname: rest === '' ? '/' : rest }
}

/**
 * Move an app-relative path into a locale.
 *
 * Only paths rooted at `/` are the app's. Absolute and protocol-relative
 * URLs, fragments and relative paths are left alone, as is a path that
 * already starts with a locale or with an excluded segment such as `/api`.
 * The default locale gets no prefix unless `localePrefix` is `always`.
 */
export const localizePath = (
  config: NormalizedConfig,
  href: string,
  locale: string
): string => {
  if (!href.startsWith('/') || href.startsWith('//')) return href

  const end = pathEnd(href)
  const pathname = href.slice(0, end)
  const rest = href.slice(end)
  const segment = firstSegment(pathname)

  if (config.locales.includes(segment)) return href
  if (config.exclude.includes(segment)) return href
  if (locale === config.defaultLocale && config.localePrefix === 'as-needed') return href

  return `/${locale}${pathname === '/' ? '' : pathname}${rest}`
}

/** `localizePath` for whatever a `next/link` accepts. */
export const localizeHref = <T extends Href>(
  config: NormalizedConfig,
  href: T,
  locale: string
): T => {
  if (typeof href === 'string') return localizePath(config, href, locale) as T
  if (href && typeof href === 'object' && typeof href.pathname === 'string') {
    return { ...href, pathname: localizePath(config, href.pathname, locale) } as T
  }
  return href
}

/**
 * Move a path under the prefix an app is mounted at, by the same rule
 * `prefixHref` in `@fairgarden/monolith/link` applies: only paths rooted at
 * `/`, never twice, and a lookalike is not the prefix.
 */
export const mountHref = <T extends Href>(href: T, mount: string): T => {
  if (!mount) return href

  if (typeof href === 'string') {
    if (!href.startsWith('/') || href.startsWith('//')) return href
    if (href === mount || href.startsWith(`${mount}/`)) return href
    const end = pathEnd(href)
    // `/id` followed by a query is already mounted; `/idx` is not.
    if (href.slice(0, end) === mount) return href
    return `${mount}${href}` as T
  }

  if (href && typeof href === 'object' && typeof href.pathname === 'string') {
    return { ...href, pathname: mountHref(href.pathname, mount) } as T
  }

  return href
}
