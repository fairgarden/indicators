# Fair Garden Indicators

<!-- fg:version -->

Version **0.1.0-alpha.1**

<!-- /fg:version -->

<!-- fg:releasing -->

## Releasing

This module releases on its own. `0.1.0-alpha.1` is what main is working towards,
not what is published — the version here is always the next one.

1. **Publish it.** Run the *Publish* workflow from the Actions tab, picking the
   dist tag. It refuses if that version is already on npm.
2. **Move it on.** `pnpm release` — opens a pull request bumping this branch
   to `0.1.0-alpha.2`, or `pnpm release --id rc` to change
   identifier. A prerelease gets no maintenance branch; there is no released
   line behind it yet.

Every push to main publishes `@fairgarden/indicators@canary`. A canary is not a release and
carries no promise; it is there so main can be tried without a checkout.

<!-- /fg:releasing -->

Put the locale, the user's preferences and the request's flags into the path,
so every variant of a Next.js page is a plain static route.

```
/login  +  cookie theme=dark  +  X-Vercel-IP-Timezone: America/New_York
-> /en/theme~dark/tz~EST/login
```

```ts
// lib/indicators.ts
import { createIndicators } from '@fairgarden/indicators'

export const indicators = createIndicators({
  locales: ['en', 'fr'],
  defaultLocale: 'en',
  prefs: { theme: { values: ['light', 'dark'] } },
  flags: {
    tz: { header: 'x-vercel-ip-timezone', values: { EST: 'America/(New_York|Toronto)' } },
  },
})
```

```ts
// next.config.ts
import { withFairGardenIndicators } from '@fairgarden/indicators/withFairGardenIndicators'
import { indicators } from './lib/indicators.ts'

export default withFairGardenIndicators(nextConfig, indicators)
```

```tsx
// app/[locale]/[prefs]/[flags]/layout.tsx
export const generateStaticParams = indicators.generateStaticParams

export default indicators.layout(({ children, locale, prefs }) => (
  <html lang={locale} data-theme={prefs.theme}>
    <body>{children}</body>
  </html>
))
```

A chain of `beforeFiles` rewrites turns cookies and headers into sorted path
segments; `generateStaticParams` lists the same segments, so every variant is
prerendered and the browser's URL never changes. Language negotiation runs in
a proxy at the site root and nowhere else, where a locale the user chose —
remembered in a cookie by `Link` and `useSetLocale` — wins over the
browser's list.

## Documentation

The docs are a site in this repository. Run them with:

```bash
pnpm --filter @fairgarden/indicators-docs dev
```

- **Overview** — what a request goes through
- **Indicators** — preferences, flags, and why they are kept apart
- **Paths** — the segments, and why they are the cache key
- **Rewrites** — how a cookie becomes a path segment
- **Static generation** — prerendering every variant, and routes that switch on a flag
- **Hard flags** — a route tree gated by a cookie, with the value kept on the server
- **Locales** — detection at the root, and nowhere else
- **Layouts** — where the root layout goes, and what each level reads
- **In a monolith** — mounting an app that uses this
- **Functions** — `createIndicators`, `withFairGardenIndicators`, `createNavigation`, `createLocaleProxy` and the rest

## Install

```bash
pnpm add @fairgarden/indicators
```

| Import | For |
| --- | --- |
| `@fairgarden/indicators` | `lib/indicators.ts`, layouts and pages |
| `@fairgarden/indicators/withFairGardenIndicators` | `next.config.ts` |
| `@fairgarden/indicators/link` | a client module exporting the app's `Link` and hooks |
| `@fairgarden/indicators/proxy` | `proxy.ts` |

Mounting several apps into one deployment is a separate concern, handled by
`@fairgarden/monolith`; the docs cover how the two fit.

## Background

The notes below are the design as first written. One detail moved in the
implementation: the examples spell a segment `theme=dark;tz=EST`, and the
shipped encoding is `theme~dark.tz~EST`, because Next percent-encodes `=`
and `;` in a page's params at request time but not at build time — the docs
explain under *Paths*.

Metadata from the user are not enough to assume a user's intention. Metadata that is useful for suggesting a user perform an action are considered indicators.

Some examples of indicators are:

- A user's preferred language
- A user's detected timezone
- A user's detected location or region
- A device type
- A connection type like 5G or wifi / Data Saver Mode
- A user being within a private network
- Do-not-track header

## Why are these indicators?

### A user's indicated language

Locale detection is not always accurate. A user might have left their browser locale settings in the default setting.

## Indicators vs Preferences

Indicators are metadata that are useful for suggesting a user perform an action. Preferences are metadata that are useful for personalizing the user experience. Indicators are inferred from the user's behavior or environment. Preferences are explicitly set by the user.

## Why the distinction?

Sometimes users may not have control over indicators. For example, a user's detected timezone may be different from their preferred timezone. In this case, the user may want to see content in their preferred timezone, but the detected timezone is useful for suggesting a user change or confirm their timezone.

The same applies to language. A user may be in a foreign country and not speak the local language. The detected language is useful for suggesting a user change their language settings.

## Cache Keys

In Next.js, the cache key is derived from the request path. This is because metadata from headers and cookies are not usually exposed when rendering. This is great because it keeps us from having too much cardinality.

We can selectively choose to expose metadata through the path, instead of opting out of caching altogether (which is what happens if you `await headers()`).

The most specific cache key would be the page path encompassing major personalization indicators and choices. For example, a user's preferred language, theme, timezone, and currency.

`/en-US/theme=dark;tz=EST;cur=USD/geo-tz=America,New_York;detected-loc=en-US/blog/announcement`
Where each segment represents:
`[locale]/[prefs]/[flags]/[...route]`

This means that for each major audience, we can have a separate cache. In many cases, a site may only have a few variants of this. For example, a local business' blog may only have visitors from New York and English, Spanish, and Chinese speakers using dark/light/system themes. This is only 9 cache keys where the hot path of New York + English + System Theme is still optimized.

With global audiences, there may be many variants of cache keys, but the most common cases can still be cached. For less common audiences, we will have to dynamically generate the page. Thankfully, we can use the Next.js data cache to quickly fetch the shared data between the variants.

It is important, though, that the preferences and flags are sorted properly.

The cache key for the blog content would be `/en-US/blog/announcement` with the other personalization being generated without and extra data requests.

## Why not the `Vary` header?

`Vary` is a response header, meaning the cache key cannot be derived before the request itself. It also places the entire content of a header into the cache key. By carefully placing metadata into the path using rewrites, we can narrow the cache key to only the most important metadata. We are able to transform the cache key using regex, which is not possible with the `Vary` header.

Take for example the following rewrite:

```json
{
  "source": "/:locale/blog/:slug*",
  "has": [{ "type": "header", "key": "X-Vercel-IP-Timezone", "value": "America/(New_York|Toronto|Detroit|etc)" }],
  "destination": "/:locale/tz=EST/blog/:slug*"
}
```

This allows us to lump multiple cities into a single cache key.

## Timezone Daylight Savings Time

Due to the way timezones work, the cache must be purged whenever a time change occurs. We can get the timezone location in the router, but not if daylight savings time is in effect. This benefits us anyway because there is no reason to cache content that won't be fetched again for half of the year.
