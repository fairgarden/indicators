/**
 * Pick a locale from an `Accept-Language` header.
 *
 * Deliberately small. The header is a list of language ranges with weights;
 * this takes them in order of weight and returns the first supported locale
 * that matches — exactly first, then by language alone, so `en-GB` finds
 * `en-US` when that is all there is, and `en` finds it too. Nothing more
 * elaborate is needed to choose among the handful of locales an app ships.
 */

export interface LanguageRange {
  tag: string
  quality: number
}

/** The ranges a header lists, best first. Malformed entries are skipped. */
export const parseAcceptLanguage = (header: string | null | undefined): LanguageRange[] => {
  if (!header) return []

  const ranges: Array<LanguageRange & { index: number }> = []

  header.split(',').forEach((entry, index) => {
    const [rawTag, ...params] = entry.trim().split(';')
    const tag = rawTag?.trim()
    if (!tag || !/^(?:\*|[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)$/.test(tag)) return

    let quality = 1
    for (const param of params) {
      const [name, value] = param.split('=').map((part) => part.trim())
      if (name?.toLowerCase() !== 'q' || value === undefined) continue
      const parsed = Number(value)
      quality = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 1) : 0
    }

    ranges.push({ tag, quality, index })
  })

  return ranges
    .filter((range) => range.quality > 0)
    // Stable: equal weights keep the order the header gave them.
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
    .map(({ tag, quality }) => ({ tag, quality }))
}

const language = (tag: string): string => tag.split('-')[0]!.toLowerCase()

/**
 * The supported locale a header asks for, or the default when none matches.
 *
 * A `*` range means the client will take anything, which is the default.
 */
export const negotiateLocale = (
  header: string | null | undefined,
  locales: readonly string[],
  defaultLocale: string
): string => {
  for (const { tag } of parseAcceptLanguage(header)) {
    if (tag === '*') return defaultLocale

    const exact = locales.find((locale) => locale.toLowerCase() === tag.toLowerCase())
    if (exact) return exact

    const wanted = language(tag)
    const candidates = locales.filter((locale) => language(locale) === wanted)
    if (candidates.length === 0) continue

    // The bare language when it is offered, otherwise the first region of it.
    return candidates.find((locale) => locale.toLowerCase() === wanted) ?? candidates[0]!
  }

  return defaultLocale
}
