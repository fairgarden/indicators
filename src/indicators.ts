import type { ReactNode } from 'react'
import {
  normalizeConfig,
  type Definitions,
  type IndicatorsConfig,
  type NormalizedConfig,
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

/** The object a segment decodes to: each key optional, each value one of its names. */
export type Chosen<D extends Definitions | undefined> = D extends Definitions
  ? { [K in keyof D & string]?: Names<D[K]['values']> }
  : Record<never, never>

export type Locale<C extends IndicatorsConfig> = C['locales'][number]
export type Prefs<C extends IndicatorsConfig> = Chosen<C['prefs']>
export type Flags<C extends IndicatorsConfig> = Chosen<C['flags']>

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
  locale: Locale<C>
  prefs: Prefs<C>
  flags: Flags<C>
}

export interface Indicators<C extends IndicatorsConfig> {
  /** The config with its defaults filled in, sorted the way the path is. */
  config: NormalizedConfig
  locales: Locale<C>[]
  defaultLocale: Locale<C>
  isLocale: (value: unknown) => value is Locale<C>

  locale: Level<'locale', Locale<C>, { locale: Locale<C> }>
  prefs: SegmentLevel<'prefs', Prefs<C>, { prefs: Prefs<C> }>
  flags: SegmentLevel<'flags', Flags<C>, { flags: Flags<C> }>

  /** All three segments at once, for a layout or page at or below the flags segment. */
  generateStaticParams: () => Array<{ locale: Locale<C>; prefs: string; flags: string }>
  read: (params: ParamsInput) => Promise<Resolved<C>>
  layout: (render: Render<Resolved<C>>) => (props: LayoutProps) => Promise<ReactNode>
  page: (render: PageRender<Resolved<C>>) => (props: PageProps) => Promise<ReactNode>

  /** Move an app-relative href into a locale, by the rules `localePrefix` sets. */
  href: <T extends Href>(href: T, locale: Locale<C>) => T
  /** The locale a public path starts with, if any, and the path without it. */
  splitLocale: (pathname: string) => { locale: Locale<C> | undefined; pathname: string }
  /** The supported locale an `Accept-Language` header asks for, else the default. */
  negotiate: (acceptLanguage: string | null | undefined) => Locale<C>
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

  const isLocale = (value: unknown): value is L =>
    typeof value === 'string' && normalized.locales.includes(value)

  const readLocale = async (params: ParamsInput): Promise<L> => {
    const { locale } = await resolveParams(params)
    if (!isLocale(locale)) return notFound()
    return locale
  }

  const segment = <Value extends Record<string, string | undefined>>(
    kind: 'prefs' | 'flags'
  ) => {
    const indicators = normalized[kind]
    const decode = (value: string | undefined): Value | undefined =>
      decodeSegment(indicators, value) as Value | undefined

    const read = async (params: ParamsInput): Promise<Value> => {
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
        staticSegments(indicators).map((value) => ({ [kind]: value }) as Record<typeof kind, string>),
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
    locales: normalized.locales as L[],
    defaultLocale: normalized.defaultLocale as L,
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

    generateStaticParams: () =>
      normalized.locales.flatMap((locale) =>
        staticSegments(normalized.prefs).flatMap((prefsSegment) =>
          staticSegments(normalized.flags).map((flagsSegment) => ({
            locale: locale as L,
            prefs: prefsSegment,
            flags: flagsSegment,
          }))
        )
      ),
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

    href: (href, locale) => localizeHref(normalized, href, locale),
    splitLocale: (pathname) =>
      splitLocale(normalized, pathname) as { locale: L | undefined; pathname: string },
    negotiate: (acceptLanguage) =>
      negotiateLocale(acceptLanguage, normalized.locales, normalized.defaultLocale) as L,
  }
}
