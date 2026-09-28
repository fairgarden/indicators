'use client'

import { useParams, usePathname, useRouter } from 'next/navigation'
import type { Sitemap } from '@fairgarden/docs/createSitemap/types'
import { CodeProviderLazy } from '@fairgarden/docs/CodeProvider'
import { ToastProvider } from '@fairgarden/design/feedback/toast'
import { NavigationBar } from '@fairgarden/design/navigation/navigation-bar'
import { SidebarNav } from '@fairgarden/design/navigation/sidebar-nav'
import { SearchDialog } from '@fairgarden/design/overlays/search-dialog'
import { DocsLayout, DocsLayoutDrawer } from '@fairgarden/design/page/docs-layout'
import { toSidebarItems } from '@fairgarden/design/utils/docs/toSidebarItems'
import { sitemap } from '@/app/sitemap'
import { indicators } from '@/lib/indicators'
import { Link, useHref } from '@/lib/link'

/*
 * Stopgap until the docs engine can take a base path: it derives each
 * section's prefix and title from its index's file path, which here starts
 * with the three segments the indicators rewrites fill in. Drop them.
 */
const rewriteSegments = /^\/\[locale\]\/\[prefs\]\/\[flags\]/
const rewriteTitle = /^\[locale\] \[prefs\] \[flags\] /
function publicSitemap(source: Sitemap | undefined): Sitemap | undefined {
  if (source == null) return source
  const data = Object.fromEntries(
    Object.entries(source.data).map(([key, section]) => [
      key,
      {
        ...section,
        prefix: section.prefix.replace(rewriteSegments, ''),
        title: section.title.replace(rewriteTitle, ''),
      },
    ])
  )
  return { ...source, data }
}

/** The sidebar's page tree: the sitemap's sections and their pages. */
const sidebarItems = toSidebarItems(publicSitemap(sitemap))

/** Internal links go through the site's `Link`, so they keep the page's locale. */
const renderLink = (href: string) => <Link href={href} />

/** The search index's source, read once when the dialog first mounts. */
const loadSitemap = () =>
  import('@/app/sitemap').then((module) => ({ sitemap: publicSitemap(module.sitemap) }))

/*
 * The page's public path, without its locale. Prerendered, a page's pathname
 * is the internal one the rewrites produce (`/en/-/-/overview`); in the
 * browser it is the public one (`/overview`, `/en-GB/overview`). Both come
 * out the same, so the server HTML marks the current page and hydration
 * agrees with it.
 */
function usePagePath() {
  const pathname = usePathname()
  const { locale, prefs, flags } = useParams<{ locale: string; prefs: string; flags: string }>()
  const internal = `/${locale}/${prefs}/${flags}`
  if (pathname === internal || pathname.startsWith(`${internal}/`)) {
    return pathname.slice(internal.length) || '/'
  }
  return indicators.splitLocale(pathname).pathname
}

/**
 * The docs chrome around every page, composed from the design system:
 * the Docs Layout, with the Navigation Bar (the home link, the Search
 * Dialog over the sitemap, and the drawer's menu Button below the sidebar
 * threshold) and the Sidebar Navigation, which fills the column and the
 * drawer from the same items. The current page is the page's path without
 * its locale (`usePagePath`), so the server HTML already marks it.
 *
 * `CodeProviderLazy` gives the code blocks the docs engine's client side,
 * and `ToastProvider` the toast bar their copy actions confirm in.
 *
 * A client layout, because the header and the sidebar take functions (the
 * link renderer, the sitemap loader, the router) that a server layout
 * cannot pass them.
 */
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  const currentPath = usePagePath()
  const router = useRouter()
  const toHref = useHref()
  return (
    <ToastProvider>
      <CodeProviderLazy>
        <DocsLayout
          header={
            <NavigationBar
              wide
              logo="FairGarden Indicators"
              logoLabel="FairGarden Indicators home"
              renderLink={renderLink}
              currentPath={currentPath}
              search={
                <SearchDialog
                  sitemap={loadSitemap}
                  onNavigate={(href) => router.push(toHref(href))}
                  keyboardShortcut
                />
              }
              drawer={<DocsLayoutDrawer />}
            />
          }
          sidebar={
            <SidebarNav items={sidebarItems} currentPath={currentPath} renderLink={renderLink} />
          }
        >
          {children}
        </DocsLayout>
      </CodeProviderLazy>
    </ToastProvider>
  )
}
