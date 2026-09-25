import type { ReactNode } from 'react'
import {
  normalizeConfig,
  type Definitions,
  type IndicatorsConfig,
  type NormalizedConfig,
  type Segment,
  type Values,
} from './config.ts'
import { localizeHref, splitLocale, type Href } from './hrefs.ts'
import { negotiateLocale } from './negotiate.ts'
import { decodeSegment, encodeSegment, staticSegments } from './segments.ts'

/** The names one indicator's values can take, from how it was declared. */
type Names<V extends Values> = V extends readonly (infer T)[]
  ? T extends string
    ? T
    : never
  : V extends Readonly<Record<infer K, string>>
    ? K extends string
      ? K
      : never
    : never

/**
 * The object a segment decodes to: each key optional, each value one of its
 * names. An indicator expressed through a stylesheet is not in the segment.
 */
export type Chosen<D extends Definitions | undefined> = D extends Definitions
  ? {
      [K in keyof D & string as D[K] extends { stylesheet: string } ? never : K]?: Names<
        D[K]['values']
      >
    }
  : Record<never, never>

export type Locale<C extends IndicatorsConfig> = C['locales'] extends readonly (infer L)[]
  ? L extends string
    ? L
    : never
  : never
export type Prefs<C extends IndicatorsConfig> = Chosen<C['prefs']>
export type Flags<C extends IndicatorsConfig> = Chosen<C['flags']>

/** Whether the config has locales at all. */
type HasLocale<C extends IndicatorsConfig> = C['locales'] extends readonly string[] ? true : false

/** The locale a page is in: one of the locales, or undefined for a site in one language. */
export type CurrentLocale<C extends IndicatorsConfig> = HasLocale<C> extends true
  ? Locale<C>
  : undefined

/** Every preference's key, stylesheet-backed ones included, for `usePref`. */
export type PrefKey<C extends IndicatorsConfig> = C['prefs'] extends Definitions
  ? keyof C['prefs'] & string
  : never
export type PrefValue<C extends IndicatorsConfig, K extends PrefKey<C>> =
  C['prefs'] extends Definitions ? Names<C['prefs'][K]['values']> : never

/** Whether the tree has a segment, from `segments` when given and otherwise yes. */
type HasSegment<C extends IndicatorsConfig, S extends 'prefs' | 'flags'> =
  C['segments'] extends readonly (infer T)[] ? (S extends T ? true : false) : true

/** What the combined `generateStaticParams` returns: a key per segment the tree has. */
export type StaticParams<C extends IndicatorsConfig> = (HasLocale<C> extends true
  ? { locale: Locale<C> }
  : Record<never, never>) &
  (HasSegment<C, 'prefs'> extends true ? { prefs: string } : Record<never, never>) &
  (HasSegment<C, 'flags'> extends true ? { flags: string } : Record<never, never>)

/** Route params as Next hands them to a layout or page: the object, or a promise of it. */
export type Params = Record<string, string | string[] | undefined>
export type ParamsInput = Params | Promise<Params>

export interface LayoutProps {
  children?: ReactNode
  params: ParamsInput
}

export interface PageProps {
  params: ParamsInput
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

type Render<Extra> = (
  props: { children: ReactNode; params: Params } & Extra
) => ReactNode | Promise<ReactNode>

type PageRender<Extra> = (
  props: { params: Params; searchParams: PageProps['searchParams'] } & Extra
) => ReactNode | Promise<ReactNode>

/** What every level offers: params for the static build, and a reader for a layout or page. */
export interface Level<Param extends string, Value, Extra> {
  /** Every value of this segment that should be prerendered. */
  generateStaticParams: () => Array<Record<Param, string>>
  /**
   * The value the params name. Calls `notFound()` when they name none —
   * an unsupported locale, or a segment that is not in canonical form.
   */
  read: (params: ParamsInput) => Promise<Value>
  /**
   * A layout for this segment. Reads the params, and hands the render
   * function the value alongside `children` and the resolved params.
   */
  layout: (render: Render<Extra>) => (props: LayoutProps) => Promise<ReactNode>
}

export interface SegmentLevel<Param extends string, Value, Extra>
  extends Level<Param, Value, Extra> {
  /** The canonical segment for these values. Throws on one the config does not know. */
  encode: (chosen: Value) => string
  /** The values a segment names, or undefined when it is not canonical. */
  decode: (segment: string | undefined) => Value | undefined
}

export interface Resolved<C extends IndicatorsConfig> {
  locale: CurrentLocale<C>
  prefs: Prefs<C>
  flags: Flags<C>
}

/** A stylesheet a layout links to, for an indicator expressed that way. */
export interface Stylesheet {
  key: string
  kind: 'prefs' | 'flags'
  /** Its public URL, without any mount prefix. */
  href: string
  /** Linked by the root layout on every page; otherwise by the pages that use it. */
  global: boolean
}

export interface Indicators<C extends IndicatorsConfig> {
  /** The config with its defaults filled in, sorted the way the path is. */
  config: NormalizedConfig
  /** The segments the tree has, in path order. */
  segments: Segment[]
  /** Empty for a site in one language. */
  locales: Locale<C>[]
  defaultLocale: CurrentLocale<C>
  isLocale: (value: unknown) => value is Locale<C>

  /**
   * The locale segment. For a site in one language, `generateStaticParams`
   * is empty and `read` is undefined.
   */
  locale: Level<'locale', CurrentLocale<C>, { locale: CurrentLocale<C> }>
  /**
   * The preferences segment. When the tree has none, `generateStaticParams`
   * is empty and `read` is `{}`, so shared code needs no branch.
   */
  prefs: SegmentLevel<'prefs', Prefs<C>, { prefs: Prefs<C> }>
  /** The flags segment, likewise. */
  flags: SegmentLevel<'flags', Flags<C>, { flags: Flags<C> }>

  /** All segments at once, for a layout or page at or below the last of them. */
  generateStaticParams: () => StaticParams<C>[]
  read: (params: ParamsInput) => Promise<Resolved<C>>
  layout: (render: Render<Resolved<C>>) => (props: LayoutProps) => Promise<ReactNode>
  page: (render: PageRender<Resolved<C>>) => (props: PageProps) => Promise<ReactNode>

  /** The stylesheets a layout has to link to, one per indicator expressed that way. */
  stylesheets: () => Stylesheet[]

  /** Move an app-relative href into a locale, by the rules `localePrefix` sets. */
  href: <T extends Href>(href: T, locale: Locale<C>) => T
  /** The locale a public path starts with, if any, and the path without it. */
  splitLocale: (pathname: string) => { locale: Locale<C> | undefined; pathname: string }
  /** The supported locale an `Accept-Language` header asks for, else the default. */
  negotiate: (acceptLanguage: string | null | undefined) => CurrentLocale<C>
}

const resolveParams = async (params: ParamsInput): Promise<Params> =>
  (await params) ?? {}

/**
 * Next's `notFound`, loaded when first needed rather than when this module
 * is. The app's `lib/indicators.ts` is imported by `next.config.ts`, which
 * Next loads with Node itself, where a bare `next/navigation` does not
 * resolve; the bundler resolves it, and only rendering ever gets here.
 */
const notFound = async (): Promise<never> => {
  const navigation = await import('next/navigation')
  return navigation.notFound()
}

/**
 * Describe the locales, preferences and flags an app serves, and get back
 * everything its routes need to read them, prerender them and link between
 * them. Give the result to `withFairGardenIndicators` in `next.config.ts`
 * and to `createNavigation` in a client module.
 *
 * ```ts
 * // lib/indicators.ts
 * export const indicators = createIndicators({
 *   locales: ['en', 'fr'],
 *   defaultLocale: 'en',
 *   prefs: { theme: { values: ['light', 'dark'] } },
 *   flags: { tz: { header: 'x-vercel-ip-timezone', values: { EST: 'America/(New_York|Toronto)' } } },
 * })
 * ```
 *
 * The config is checked here, when the module loads, so a mistake in it
 * fails the build rather than a request.
 */
export const createIndicators = <const C extends IndicatorsConfig>(
  config: C
): Indicators<C> => {
  const normalized = normalizeConfig(config)
  type L = Locale<C>
  type Current = CurrentLocale<C>
  const hasLocale = normalized.segments.includes('locale')

  const isLocale = (value: unknown): value is L =>
    typeof value === 'string' && normalized.locales.includes(value)

  const readLocale = async (params: ParamsInput): Promise<Current> => {
    if (!hasLocale) return undefined as Current
    const { locale } = await resolveParams(params)
    if (!isLocale(locale)) return notFound()
    return locale as Current
  }

  const segment = <Value extends Record<string, string | undefined>>(
    kind: 'prefs' | 'flags'
  ) => {
    const indicators = normalized[kind]
    const present = normalized.segments.includes(kind)
    const decode = (value: string | undefined): Value | undefined =>
      decodeSegment(indicators, value) as Value | undefined

    const read = async (params: ParamsInput): Promise<Value> => {
      if (!present) return {} as Value
      const resolved = await resolveParams(params)
      const value = resolved[kind]
      const decoded = decode(typeof value === 'string' ? value : undefined)
      if (decoded === undefined) return notFound()
      return decoded
    }

    return {
      encode: (chosen: Value) => encodeSegment(indicators, chosen),
      decode,
      generateStaticParams: () =>
        present
          ? staticSegments(indicators).map(
              (value) => ({ [kind]: value }) as Record<typeof kind, string>
            )
          : [],
      read,
      layout:
        (render: Render<Record<typeof kind, Value>>) =>
        async ({ children, params }: LayoutProps) => {
          const resolved = await resolveParams(params)
          const value = await read(resolved)
          return render({ children, params: resolved, [kind]: value } as Parameters<
            typeof render
          >[0])
        },
    }
  }

  const read = async (params: ParamsInput): Promise<Resolved<C>> => {
    const resolved = await resolveParams(params)
    return {
      locale: await readLocale(resolved),
      prefs: await prefs.read(resolved),
      flags: await flags.read(resolved),
    }
  }

  const prefs = segment<Prefs<C>>('prefs')
  const flags = segment<Flags<C>>('flags')

  return {
    config: normalized,
    segments: normalized.segments,
    locales: normalized.locales as L[],
    defaultLocale: normalized.defaultLocale as Current,
    isLocale,

    locale: {
      generateStaticParams: () => normalized.locales.map((locale) => ({ locale })),
      read: readLocale,
      layout:
        (render) =>
        async ({ children, params }) => {
          const resolved = await resolveParams(params)
          return render({ children, params: resolved, locale: await readLocale(resolved) })
        },
    },
    prefs: prefs as unknown as Indicators<C>['prefs'],
    flags: flags as unknown as Indicators<C>['flags'],

    generateStaticParams: () => {
      // No segment, no params: a tree with nothing dynamic has nothing to list.
      if (normalized.segments.length === 0) return []
      const locales: Array<string | undefined> = hasLocale ? normalized.locales : [undefined]
      const prefsSegments = normalized.segments.includes('prefs')
        ? staticSegments(normalized.prefs)
        : [undefined]
      const flagsSegments = normalized.segments.includes('flags')
        ? staticSegments(normalized.flags)
        : [undefined]
      return locales.flatMap((locale) =>
        prefsSegments.flatMap((prefsSegment) =>
          flagsSegments.map(
            (flagsSegment) =>
              ({
                ...(locale === undefined ? {} : { locale }),
                ...(prefsSegment === undefined ? {} : { prefs: prefsSegment }),
                ...(flagsSegment === undefined ? {} : { flags: flagsSegment }),
              }) as StaticParams<C>
          )
        )
      )
    },
    read,
    layout:
      (render) =>
      async ({ children, params }) => {
        const resolved = await resolveParams(params)
        return render({ children, params: resolved, ...(await read(resolved)) })
      },
    page:
      (render) =>
      async ({ params, searchParams }) => {
        const resolved = await resolveParams(params)
        return render({ params: resolved, searchParams, ...(await read(resolved)) })
      },

    stylesheets: () =>
      normalized.stylesheets.map(({ key, kind, href, global }) => ({ key, kind, href, global })),

    href: (href, locale) => localizeHref(normalized, href, locale),
    splitLocale: (pathname) =>
      splitLocale(normalized, pathname) as { locale: L | undefined; pathname: string },
    negotiate: (acceptLanguage) =>
      (normalized.defaultLocale === undefined
        ? undefined
        : negotiateLocale(acceptLanguage, normalized.locales, normalized.defaultLocale)) as Current,
  }
}
