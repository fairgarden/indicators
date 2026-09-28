import type { Metadata } from 'next'
import '@fairgarden/design/utils/global.css'
import '@fairgarden/design/utils/fonts'
import { ClientProvider } from '@fairgarden/design/utils/ClientProvider'
import { Stylesheets } from '@fairgarden/indicators'
import { indicators } from '@/lib/indicators'
import './globals.css'

export const metadata: Metadata = {
  title: '@fairgarden/indicators',
  description:
    'Put locale, preferences and flags into the path, so every variant of a Next.js page is a static cache key',
}

// Every locale, theme and flag combination, so each page below is
// prerendered for each. What is not listed renders on its first request.
export const generateStaticParams = indicators.generateStaticParams

/**
 * The root layout sits below all three segments so the theme can go on
 * <html>: it is in the HTML the browser receives, and the design system's
 * stylesheet keys off it, so there is no frame in the wrong theme. With the
 * design system's global stylesheet and fonts, and `ClientProvider`, which
 * gives the components the page's locale. The docs chrome is the `(lib)`
 * layout; the demos' own widgets are styled in globals.css.
 */
export default indicators.layout(({ children, locale, prefs }) => (
  <html lang={locale} data-theme={prefs.theme}>
    <head>
      <Stylesheets indicators={indicators} />
    </head>
    <body>
      <ClientProvider locale={locale}>{children}</ClientProvider>
    </body>
  </html>
))
