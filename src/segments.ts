import { compareKeys, type NormalizedIndicator } from './config.ts'

/**
 * The preferences and flags segments.
 *
 * Each is `key~value` pairs joined by `.`, sorted by key, or `-` when there
 * are none:
 *
 *     /en/theme~dark.tz~EST/lang~fr/login
 *
 * The separators are the two of RFC 3986's unreserved characters that a key
 * or value can do without. Next percent-encodes a page's params at request
 * time — `theme=dark` arrives as `theme%3Ddark` — but not at build time, so
 * a segment holding `=` or `;` would never match its prerendered copy and
 * would fail the canonical check below. Nothing ever encodes `~` or `.`.
 *
 * The order is not a nicety. The segment is the cache key, so the same set of
 * values has to produce the same string every time — from the rewrites that
 * build it, from `generateStaticParams`, and from a route directory named
 * after it. A segment that is not in this exact form is rejected rather than
 * normalized, so a crafted URL cannot create a second cache entry for a
 * variant that already has one.
 */

/** The segment holding no values. A dynamic segment cannot be empty. */
export const EMPTY_SEGMENT = '-'
export const PAIR_SEPARATOR = '.'
export const VALUE_SEPARATOR = '~'

export type Chosen = Record<string, string | undefined>

/**
 * The canonical segment for a set of values.
 *
 * Throws on a key or value the config does not know, since that would name a
 * variant nothing can serve.
 */
export const encodeSegment = (indicators: NormalizedIndicator[], chosen: Chosen): string => {
  const pairs: string[] = []

  for (const indicator of indicators) {
    const value = chosen[indicator.key]
    if (value === undefined) continue
    if (!indicator.values.some((candidate) => candidate.name === value)) {
      throw new Error(
        `${indicator.kind}.${indicator.key} has no value ${JSON.stringify(value)}.`
      )
    }
    pairs.push(`${indicator.key}${VALUE_SEPARATOR}${value}`)
  }

  for (const key of Object.keys(chosen)) {
    if (chosen[key] !== undefined && !indicators.some((indicator) => indicator.key === key)) {
      throw new Error(`${JSON.stringify(key)} is not a known indicator.`)
    }
  }

  return pairs.length === 0 ? EMPTY_SEGMENT : pairs.join(PAIR_SEPARATOR)
}

/**
 * The values a segment names, or undefined when it is not canonical: an
 * unknown key or value, a pair out of order, a key twice, or anything else
 * that is not exactly what `encodeSegment` would produce.
 */
export const decodeSegment = (
  indicators: NormalizedIndicator[],
  segment: string | undefined
): Record<string, string> | undefined => {
  if (typeof segment !== 'string') return undefined
  if (segment === EMPTY_SEGMENT) return {}
  if (segment === '') return undefined

  const chosen: Record<string, string> = {}
  let previous: string | undefined

  for (const pair of segment.split(PAIR_SEPARATOR)) {
    const at = pair.indexOf(VALUE_SEPARATOR)
    if (at <= 0) return undefined
    const key = pair.slice(0, at)
    const value = pair.slice(at + 1)

    if (previous !== undefined && compareKeys(previous, key) >= 0) return undefined
    previous = key

    const indicator = indicators.find((candidate) => candidate.key === key)
    if (!indicator) return undefined
    if (!indicator.values.some((candidate) => candidate.name === value)) return undefined

    chosen[key] = value
  }

  return chosen
}

/**
 * Every segment `generateStaticParams` should produce: each indicator either
 * absent or at one of the values it prerenders, in every combination. The
 * empty segment comes first, since it is the hot path. Every other
 * combination is still served, rendered on its first request.
 */
export const staticSegments = (indicators: NormalizedIndicator[]): string[] => {
  let combinations: Chosen[] = [{}]

  for (const indicator of indicators) {
    const names = indicator.prerender
    if (names.length === 0) continue
    combinations = combinations.flatMap((chosen) => [
      chosen,
      ...names.map((name) => ({ ...chosen, [indicator.key]: name })),
    ])
  }

  return combinations.map((chosen) => encodeSegment(indicators, chosen))
}
