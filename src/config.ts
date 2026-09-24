/**
 * What an app declares, and the normalized form everything else works from.
 *
 * Three things go into the path, in this order: the locale, the preferences
 * and the flags. Locale is a segment of its own. Preferences and flags are
 * each one segment holding `key=value` pairs — see `segments.ts` for the
 * encoding — and both are described the same way; they differ in where they
 * come from by default (a cookie for a preference, a header for a flag) and
 * in what they mean (a choice the user made, against a fact about the
 * request).
 */

/**
 * The values a preference or flag may take.
 *
 * An array lists them literally: the cookie or header has to equal one. A
 * record maps each name to a regular expression that the raw value has to
 * match in full, so several raw values can be lumped under one name — every
 * city in a timezone, say — which is what keeps the number of variants down.
 */
export type Values = readonly string[] | Readonly<Record<string, string>>

export interface IndicatorDefinition {
  values: Values
  /** Read from this cookie. The default source for a preference, named after it. */
  cookie?: string
  /** Read from this header. The default source for a flag, named after it. */
  header?: string
  /** Read from this query parameter. */
  query?: string
  /**
   * Whether `generateStaticParams` includes this indicator. Defaults to true.
   * A variant that is not prerendered is still served — it renders on the
   * first request and is cached from then on — so turn this off for the
   * long tail rather than leaving a page out of the static build.
   */
  prerender?: boolean
  /**
   * How long a cookie written through `usePref` lives, in seconds. Defaults
   * to a year. Only meaningful for a cookie-backed indicator.
   */
  maxAge?: number
}

export type Definitions = Readonly<Record<string, IndicatorDefinition>>

export interface IndicatorsConfig {
  /** Every locale the app serves, as it appears in the path: `en`, `fr-CA`. */
  locales: readonly string[]
  /** The locale served when the path names none. Must be one of `locales`. */
  defaultLocale: string
  /**
   * `as-needed` keeps the default locale out of public URLs, so `/login` is
   * the default locale's login page and `/fr/login` is French. `always` gives
   * every locale a prefix. Defaults to `as-needed`.
   */
  localePrefix?: 'as-needed' | 'always'
  /**
   * A cookie that overrides language negotiation at the site root, for a user
   * who has chosen a locale explicitly. Never consulted anywhere else: a
   * public URL always means one locale.
   */
  localeCookie?: string
  /** Choices the user has made, read from cookies unless told otherwise. */
  prefs?: Definitions
  /** Facts about the request, read from headers unless told otherwise. */
  flags?: Definitions
  /**
   * Top-level paths that are never localized, besides `_next`, `api` and
   * `.well-known`, which never are. An OIDC endpoint served at `/oidc`, say.
   */
  exclude?: readonly string[]
}

export type SourceType = 'cookie' | 'header' | 'query'

export interface NormalizedValue {
  /** What appears in the path. */
  name: string
  /** A regular expression the raw cookie or header has to match in full. */
  pattern: string
}

export interface NormalizedIndicator {
  key: string
  kind: 'prefs' | 'flags'
  source: { type: SourceType; key: string }
  values: NormalizedValue[]
  prerender: boolean
  maxAge: number
}

export interface NormalizedConfig {
  locales: string[]
  defaultLocale: string
  localePrefix: 'as-needed' | 'always'
  localeCookie: string | undefined
  /** Sorted by key, which is the order they take in the path. */
  prefs: NormalizedIndicator[]
  /** Sorted by key, which is the order they take in the path. */
  flags: NormalizedIndicator[]
  /** Top-level paths left alone, the built-in ones included. */
  exclude: string[]
}

/** Paths Next serves itself, or that never belong to a locale. */
export const ALWAYS_EXCLUDED = ['_next', 'api', '.well-known'] as const

const ONE_YEAR = 60 * 60 * 24 * 365

/**
 * A key or a value has to survive as-is in a path segment and in a
 * directory name, must never be percent-encoded, and must not contain the
 * characters the segment encoding uses. That leaves letters, digits, `_`
 * and `-`: `America/New_York` becomes `America_New_York`.
 */
const KEY = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const VALUE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const LOCALE = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/

/** Same escaping Next applies to literal route parts. */
export const escapeRegExp = (value: string): string =>
  value.replace(/[|\\{}()[\]^$+*?.-]/g, '\\$&')

/** Code unit order, which is what the path uses; not locale-aware on purpose. */
export const compareKeys = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0

const normalizeValues = (kind: string, key: string, values: Values): NormalizedValue[] => {
  const entries: Array<[string, string]> = Array.isArray(values)
    ? (values as readonly string[]).map((value) => [value, escapeRegExp(value)])
    : Object.entries(values as Readonly<Record<string, string>>)

  if (entries.length === 0) {
    throw new Error(`${kind}.${key} lists no values; an indicator needs at least one.`)
  }

  const seen = new Set<string>()
  return entries.map(([name, pattern]) => {
    if (!VALUE.test(name)) {
      throw new Error(
        `${kind}.${key} has the value ${JSON.stringify(name)}, which cannot go in a path. ` +
          'Use letters, digits, "_" and "-", starting with a letter or digit.'
      )
    }
    if (seen.has(name)) throw new Error(`${kind}.${key} lists ${JSON.stringify(name)} twice.`)
    seen.add(name)
    if (typeof pattern !== 'string') {
      throw new Error(`${kind}.${key}.${name} must map to a regular expression string.`)
    }
    try {
      new RegExp(`^(?:${pattern})$`)
    } catch (cause) {
      throw new Error(`${kind}.${key}.${name} is not a valid regular expression: ${pattern}`, {
        cause,
      })
    }
    return { name, pattern }
  })
}

const normalizeIndicators = (
  kind: 'prefs' | 'flags',
  definitions: Definitions | undefined
): NormalizedIndicator[] =>
  Object.entries(definitions ?? {})
    .map(([key, definition]): NormalizedIndicator => {
      if (!KEY.test(key)) {
        throw new Error(
          `${kind} key ${JSON.stringify(key)} cannot go in a path. Use letters, digits, ` +
            '"_" and "-", starting with a letter or digit.'
        )
      }
      if (!definition || typeof definition !== 'object') {
        throw new Error(`${kind}.${key} must be an object with "values".`)
      }

      const sources = (['cookie', 'header', 'query'] as const).filter(
        (type) => definition[type] !== undefined
      )
      if (sources.length > 1) {
        throw new Error(
          `${kind}.${key} names more than one source (${sources.join(', ')}); pick one.`
        )
      }
      const type: SourceType = sources[0] ?? (kind === 'prefs' ? 'cookie' : 'header')
      const sourceKey = definition[type] ?? key
      if (typeof sourceKey !== 'string' || sourceKey === '') {
        throw new Error(`${kind}.${key}.${type} must be a non-empty string.`)
      }

      return {
        key,
        kind,
        // Headers are case-insensitive and Node lowercases them; Next reads the
        // `has` key lowercased too, so store it that way.
        source: { type, key: type === 'header' ? sourceKey.toLowerCase() : sourceKey },
        values: normalizeValues(kind, key, definition.values),
        prerender: definition.prerender ?? true,
        maxAge: definition.maxAge ?? ONE_YEAR,
      }
    })
    .sort((a, b) => compareKeys(a.key, b.key))

/** Check a config and fill in its defaults. Throws on anything that would misroute. */
export const normalizeConfig = (config: IndicatorsConfig): NormalizedConfig => {
  if (!config || typeof config !== 'object') throw new Error('createIndicators needs a config.')

  const locales = [...(config.locales ?? [])]
  if (locales.length === 0) throw new Error('locales must list at least one locale.')
  for (const locale of locales) {
    if (typeof locale !== 'string' || !LOCALE.test(locale)) {
      throw new Error(`${JSON.stringify(locale)} is not usable as a locale segment.`)
    }
  }
  if (new Set(locales.map((locale) => locale.toLowerCase())).size !== locales.length) {
    throw new Error('locales lists the same locale twice.')
  }
  if (!locales.includes(config.defaultLocale)) {
    throw new Error(
      `defaultLocale ${JSON.stringify(config.defaultLocale)} is not one of the locales.`
    )
  }
  if (
    config.localePrefix !== undefined &&
    config.localePrefix !== 'as-needed' &&
    config.localePrefix !== 'always'
  ) {
    throw new Error(`localePrefix must be "as-needed" or "always".`)
  }

  const exclude = [...ALWAYS_EXCLUDED, ...(config.exclude ?? [])]
  for (const entry of exclude) {
    if (typeof entry !== 'string' || entry === '' || entry.includes('/')) {
      throw new Error(
        `exclude entry ${JSON.stringify(entry)} must be a single path segment, such as "oidc".`
      )
    }
  }
  for (const locale of locales) {
    if (exclude.includes(locale)) {
      throw new Error(`${JSON.stringify(locale)} is both a locale and excluded.`)
    }
  }

  return {
    locales,
    defaultLocale: config.defaultLocale,
    localePrefix: config.localePrefix ?? 'as-needed',
    localeCookie: config.localeCookie,
    prefs: normalizeIndicators('prefs', config.prefs),
    flags: normalizeIndicators('flags', config.flags),
    exclude: [...new Set(exclude)],
  }
}
