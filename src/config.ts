/**
 * What an app declares, and the normalized form everything else works from.
 *
 * Three things go into the path, in this order: the locale, the preferences
 * and the flags. Locale is a segment of its own. Preferences and flags are
 * each one segment holding `key~value` pairs — see `segments.ts` for the
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
  /**
   * Express this indicator through a stylesheet instead of a path segment.
   *
   * The value is the public URL of the stylesheet a layout links to. A
   * request for it is rewritten, by the same cookie or header match, to a
   * sibling file named after it and the value — `/theme.css` becomes
   * `/theme.dark.css` — or to `.default.css` when nothing matches, and it
   * is served `private, no-cache` so the browser revalidates it on every
   * page. The files are the app's, under `public/`, and are usually one
   * line: `:root { color-scheme: dark; --theme: dark }`.
   *
   * The indicator then does not multiply the pages: it is left out of the
   * segment, of `generateStaticParams` and of what `read` returns. For a
   * site with many heavy pages that is the point.
   */
  stylesheet?: string
  /** Read from this cookie. The default source for a preference, named after it. */
  cookie?: string
  /** Read from this header. The default source for a flag, named after it. */
  header?: string
  /** Read from this query parameter. */
  query?: string
  /**
   * Which of the values `generateStaticParams` prerenders: all of them
   * (`true`, the default), none (`false`), or the names of the common ones.
   * A variant left out is still served — Next renders it on its first
   * request and caches it from then on — so a company in New York lists its
   * own timezone here and lets the rest be rendered on demand.
   */
  prerender?: boolean | readonly string[]
  /**
   * How long a cookie written through `usePref` lives, in seconds. Defaults
   * to a year. Only meaningful for a cookie-backed indicator.
   */
  maxAge?: number
  /**
   * Whether every page links the stylesheet. Defaults to true: the root
   * layout's `<Stylesheets>` links it and the plugin preloads it. `false`
   * leaves it to the pages that use it, each rendering `<Stylesheets
   * only={[key]}>`, so the rest never ask for it. Only meaningful with a
   * `stylesheet`.
   *
   * Once a page has linked it, React keeps it in the `<head>` for the rest
   * of the visit, so its rules should reach only what that page renders:
   * `.downloads [data-os]`, not `[data-os]`.
   */
  global?: boolean
}

export type Definitions = Readonly<Record<string, IndicatorDefinition>>

export type Segment = 'locale' | 'prefs' | 'flags'

export interface IndicatorsConfig {
  /**
   * Which segments the route tree has. By default all three when there are
   * locales, and the other two when there are none; a site that expresses
   * its preferences through stylesheets can do with fewer:
   *
   *     segments: ['locale']      ->  app/[locale]/...
   *     segments: []              ->  app/...
   *
   * An indicator without a `stylesheet` needs its segment, and so do the
   * locales.
   */
  segments?: readonly Segment[]
  /**
   * Every locale the app serves, as it appears in the path: `en`, `fr-CA`.
   * Leave it out for a site in one language: there is then no locale
   * segment, nothing to negotiate at the root, and links are left as they
   * are.
   */
  locales?: readonly string[]
  /** The locale served when the path names none. Must be one of `locales`. */
  defaultLocale?: string
  /**
   * `as-needed` keeps the default locale out of public URLs, so `/login` is
   * the default locale's login page and `/fr/login` is French. `always` gives
   * every locale a prefix. Defaults to `as-needed`.
   */
  localePrefix?: 'as-needed' | 'always'
  /**
   * A cookie remembering a locale the user chose. The proxy reads it at the
   * site root before `Accept-Language`; a `Link` with a `locale` prop and
   * `useSetLocale` write it. Never consulted anywhere else: a public URL
   * always means one locale. Defaults to `locale`; `false` for none.
   */
  localeCookie?: string | false
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

/**
 * A flag that becomes a route segment of its own, after the flags segment,
 * when its cookie or header matches: `/en/-/-/beta/login`, served by
 * `app/[locale]/[prefs]/[flags]/beta/login/page.tsx`.
 *
 * Given to `withFairGardenIndicators` rather than `createIndicators`,
 * because the app's indicators module is bundled for the browser and a
 * value that gates a route is usually a secret. The matching happens in the
 * rewrites, which only the server sees.
 */
export interface HardFlagDefinition {
  /** Raw values that switch the flag on: literals, or patterns matched in full. */
  values: Values
  /** Read from this cookie. The default, named after the flag. */
  cookie?: string
  /** Read from this header. */
  header?: string
  /** Read from this query parameter. */
  query?: string
}

export type HardFlags = Readonly<Record<string, HardFlagDefinition>>

export interface NormalizedHardFlag {
  /** The route segment, which is also the name. */
  key: string
  source: { type: SourceType; key: string }
  /** Regular expressions the raw value has to match in full; any will do. */
  patterns: string[]
}

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
  /** The names of the values `generateStaticParams` includes. */
  prerender: string[]
  maxAge: number
}

/** An indicator expressed through a stylesheet — see `IndicatorDefinition`. */
export interface NormalizedStylesheet {
  key: string
  kind: 'prefs' | 'flags'
  source: { type: SourceType; key: string }
  values: NormalizedValue[]
  /** The public URL a layout links to. */
  href: string
  /** `href` without its `.css`: what the files it is rewritten to are named after. */
  base: string
  maxAge: number
  /** Linked on every page, rather than by the pages that use it. */
  global: boolean
}

export interface NormalizedConfig {
  /** The segments the tree has, in path order; `locale`, when there is one, first. */
  segments: Segment[]
  /** Empty for a site in one language, which then has no locale segment. */
  locales: string[]
  defaultLocale: string | undefined
  localePrefix: 'as-needed' | 'always'
  localeCookie: string | undefined
  /** Sorted by key, which is the order they take in the path. */
  prefs: NormalizedIndicator[]
  /** Sorted by key, which is the order they take in the path. */
  flags: NormalizedIndicator[]
  /** Indicators expressed through a stylesheet, sorted by key. */
  stylesheets: NormalizedStylesheet[]
  /** Top-level paths left alone, the built-in ones included. */
  exclude: string[]
}

/** The file a stylesheet indicator is rewritten to for one of its values. */
export const stylesheetFile = (sheet: NormalizedStylesheet, value: string): string =>
  `${sheet.base}.${value}.css`

/** The file it is rewritten to when nothing matches. */
export const DEFAULT_STYLESHEET = 'default'

/** Paths Next serves itself, or that never belong to a locale. */
export const ALWAYS_EXCLUDED = ['_next', 'api', '.well-known'] as const

/** How long a locale or preference cookie lives, in seconds. */
export const ONE_YEAR = 60 * 60 * 24 * 365

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

/** A hard flag's source, with the same rules as an indicator's. */
const normalizeSource = (
  kind: string,
  key: string,
  definition: { cookie?: string; header?: string; query?: string },
  fallback: SourceType
): { type: SourceType; key: string } => {
  const sources = (['cookie', 'header', 'query'] as const).filter(
    (type) => definition[type] !== undefined
  )
  if (sources.length > 1) {
    throw new Error(`${kind}.${key} names more than one source (${sources.join(', ')}); pick one.`)
  }
  const type: SourceType = sources[0] ?? fallback
  const sourceKey = definition[type] ?? key
  if (typeof sourceKey !== 'string' || sourceKey === '') {
    throw new Error(`${kind}.${key}.${type} must be a non-empty string.`)
  }
  // Headers are case-insensitive and Node lowercases them; Next reads the
  // `has` key lowercased too, so store it that way.
  return { type, key: type === 'header' ? sourceKey.toLowerCase() : sourceKey }
}

const HREF = /^\/[^?#]*\.css$/

const normalizeIndicators = (
  kind: 'prefs' | 'flags',
  definitions: Definitions | undefined
): { segment: NormalizedIndicator[]; stylesheets: NormalizedStylesheet[] } => {
  const segment: NormalizedIndicator[] = []
  const stylesheets: NormalizedStylesheet[] = []

  for (const [key, definition] of Object.entries(definitions ?? {})) {
    const indicator = normalizeIndicator(kind, key, definition)
    if (definition.global !== undefined && typeof definition.global !== 'boolean') {
      throw new Error(`${kind}.${key}.global must be true or false.`)
    }
    if (definition.stylesheet === undefined) {
      if (definition.global !== undefined) {
        throw new Error(`${kind}.${key}.global says where a stylesheet is linked, and it has none.`)
      }
      segment.push(indicator)
      continue
    }
    const href = definition.stylesheet
    if (typeof href !== 'string' || !HREF.test(href)) {
      throw new Error(`${kind}.${key}.stylesheet must be a path ending in .css, such as "/theme.css".`)
    }
    stylesheets.push({
      key,
      kind,
      source: indicator.source,
      values: indicator.values,
      href,
      base: href.slice(0, -'.css'.length),
      maxAge: indicator.maxAge,
      global: definition.global ?? true,
    })
  }

  return {
    segment: segment.sort((a, b) => compareKeys(a.key, b.key)),
    stylesheets: stylesheets.sort((a, b) => compareKeys(a.key, b.key)),
  }
}

const normalizeIndicator = (
  kind: 'prefs' | 'flags',
  key: string,
  definition: IndicatorDefinition
): NormalizedIndicator => {
  if (!KEY.test(key)) {
    throw new Error(
      `${kind} key ${JSON.stringify(key)} cannot go in a path. Use letters, digits, ` +
        '"_" and "-", starting with a letter or digit.'
    )
  }
  if (!definition || typeof definition !== 'object') {
    throw new Error(`${kind}.${key} must be an object with "values".`)
  }

  const values = normalizeValues(kind, key, definition.values)
  const wanted = definition.prerender ?? true
  let prerender: string[]
  if (wanted === true) {
    prerender = values.map((value) => value.name)
  } else if (wanted === false) {
    prerender = []
  } else if (Array.isArray(wanted)) {
    for (const name of wanted) {
      if (!values.some((value) => value.name === name)) {
        throw new Error(`${kind}.${key}.prerender names ${JSON.stringify(name)}, which is not a value.`)
      }
    }
    prerender = values.filter((value) => wanted.includes(value.name)).map((value) => value.name)
  } else {
    throw new Error(`${kind}.${key}.prerender must be true, false or a list of values.`)
  }

  return {
    key,
    kind,
    source: normalizeSource(kind, key, definition, kind === 'prefs' ? 'cookie' : 'header'),
    values,
    prerender,
    maxAge: definition.maxAge ?? ONE_YEAR,
  }
}

/**
 * Check the hard flags given to the plugin. A name is a route segment, so
 * it follows the rules of a key, and it must not be a locale, which is what
 * the segment before it holds.
 */
export const normalizeHardFlags = (
  definitions: HardFlags | undefined,
  config: NormalizedConfig
): NormalizedHardFlag[] =>
  Object.entries(definitions ?? {})
    .map(([key, definition]): NormalizedHardFlag => {
      if (!KEY.test(key)) {
        throw new Error(
          `hardFlags key ${JSON.stringify(key)} cannot be a route segment. Use letters, digits, ` +
            '"_" and "-", starting with a letter or digit.'
        )
      }
      if (config.locales.includes(key)) {
        throw new Error(`hardFlags key ${JSON.stringify(key)} is also a locale.`)
      }
      if (!definition || typeof definition !== 'object') {
        throw new Error(`hardFlags.${key} must be an object with "values".`)
      }
      return {
        key,
        source: normalizeSource('hardFlags', key, definition, 'cookie'),
        patterns: normalizeValues('hardFlags', key, definition.values).map(
          (value) => value.pattern
        ),
      }
    })
    .sort((a, b) => compareKeys(a.key, b.key))

/** Check a config and fill in its defaults. Throws on anything that would misroute. */
export const normalizeConfig = (config: IndicatorsConfig): NormalizedConfig => {
  if (!config || typeof config !== 'object') throw new Error('createIndicators needs a config.')

  const hasLocales = config.locales !== undefined
  const locales = [...(config.locales ?? [])]
  if (hasLocales && locales.length === 0) {
    throw new Error('locales must list at least one locale, or be left out.')
  }
  for (const locale of locales) {
    if (typeof locale !== 'string' || !LOCALE.test(locale)) {
      throw new Error(`${JSON.stringify(locale)} is not usable as a locale segment.`)
    }
  }
  if (new Set(locales.map((locale) => locale.toLowerCase())).size !== locales.length) {
    throw new Error('locales lists the same locale twice.')
  }
  if (hasLocales && (config.defaultLocale === undefined || !locales.includes(config.defaultLocale))) {
    throw new Error(
      `defaultLocale ${JSON.stringify(config.defaultLocale)} is not one of the locales.`
    )
  }
  if (!hasLocales && config.defaultLocale !== undefined) {
    throw new Error('defaultLocale is given, but there are no locales.')
  }
  if (
    config.localePrefix !== undefined &&
    config.localePrefix !== 'as-needed' &&
    config.localePrefix !== 'always'
  ) {
    throw new Error(`localePrefix must be "as-needed" or "always".`)
  }

  const localeCookie =
    !hasLocales || config.localeCookie === false
      ? undefined
      : (config.localeCookie ?? 'locale')
  if (localeCookie !== undefined && (typeof localeCookie !== 'string' || localeCookie === '')) {
    throw new Error('localeCookie must be a cookie name, or false.')
  }

  const wanted = [
    ...(config.segments ?? (hasLocales ? ['locale', 'prefs', 'flags'] : ['prefs', 'flags'])),
  ]
  for (const segment of wanted) {
    if (segment !== 'locale' && segment !== 'prefs' && segment !== 'flags') {
      throw new Error(`segments may hold "locale", "prefs" and "flags", not ${JSON.stringify(segment)}.`)
    }
  }
  if (hasLocales && !wanted.includes('locale')) {
    throw new Error('locales are given, but segments leaves the locale segment out.')
  }
  if (!hasLocales && wanted.includes('locale')) {
    throw new Error('segments has a locale segment, but no locales are given.')
  }
  const segments: Segment[] = (['locale', 'prefs', 'flags'] as const).filter((segment) =>
    wanted.includes(segment)
  )

  const prefs = normalizeIndicators('prefs', config.prefs)
  const flags = normalizeIndicators('flags', config.flags)
  for (const [kind, list] of [['prefs', prefs.segment], ['flags', flags.segment]] as const) {
    if (list.length > 0 && !segments.includes(kind)) {
      throw new Error(
        `${kind}.${list[0].key} goes in the ${kind} segment, which segments leaves out. ` +
          `Add "${kind}" to segments, or give it a stylesheet.`
      )
    }
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

  const stylesheets = [...prefs.stylesheets, ...flags.stylesheets].sort((a, b) =>
    compareKeys(a.key, b.key)
  )
  const seen = new Set<string>()
  const keys = new Set<string>()
  for (const sheet of stylesheets) {
    if (seen.has(sheet.href)) {
      throw new Error(`Two indicators share the stylesheet ${sheet.href}; each needs its own.`)
    }
    seen.add(sheet.href)
    // `<Stylesheets only>` and `usePref` name a stylesheet by its key alone.
    if (keys.has(sheet.key)) {
      throw new Error(
        `prefs.${sheet.key} and flags.${sheet.key} both have a stylesheet, which is named by its key alone; rename one.`
      )
    }
    keys.add(sheet.key)
    // Its rewrites run before the locale steps, and a locale directory would
    // then have the empty segments pushed into the file it was rewritten to.
    const directory = sheet.href.split('/')[1] ?? ''
    if (locales.includes(directory)) {
      throw new Error(`${sheet.kind}.${sheet.key}.stylesheet is under /${directory}, which is a locale.`)
    }
  }

  return {
    segments,
    locales,
    defaultLocale: config.defaultLocale,
    localePrefix: config.localePrefix ?? 'as-needed',
    localeCookie,
    prefs: prefs.segment,
    flags: flags.segment,
    stylesheets,
    exclude: [...new Set(exclude)],
  }
}
