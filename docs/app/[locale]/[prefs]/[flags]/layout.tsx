import type { Metadata } from 'next'
import { Stylesheets } from '@fairgarden/indicators'
import { indicators } from '@/lib/indicators'
import { Link } from '@/lib/link'
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
 * <html>: it is in the HTML the browser receives, and the stylesheet keys
 * off it, so there is no frame in the wrong theme.
 */
export default indicators.layout(({ children, locale, prefs }) => (
  <html lang={locale} data-theme={prefs.theme}>
    <head>
      <Stylesheets indicators={indicators} />
    </head>
    <body>
      <nav>
        <Link href="/">Home</Link>
        <Link href="/overview">Overview</Link>
        <Link href="/functions">Functions</Link>
        <Link href="/demos">Demos</Link>
      </nav>
      <main>{children}</main>
    </body>
  </html>
))
