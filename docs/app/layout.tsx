import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: '@fairgarden/indicators',
  description:
    'Put locale, preferences and flags into the path, so every variant of a Next.js page is a static cache key',
}

/**
 * Unstyled on purpose. The nav is here so every page has a way back, since the
 * pages themselves only cross-link within a section.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <nav>
          <Link href="/">Home</Link> · <Link href="/overview">Overview</Link> ·{' '}
          <Link href="/functions">Functions</Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  )
}
