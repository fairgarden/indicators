import { createSitemap } from '@fairgarden/docs/createSitemap'
import Overview from '../[locale]/[prefs]/[flags]/(lib)/overview/page.mdx'
import Functions from '../[locale]/[prefs]/[flags]/(lib)/functions/page.mdx'
import Demos from '../[locale]/[prefs]/[flags]/(lib)/demos/page.mdx'

// Sections in navigation order. Overview and Functions are section indexes
// the docs engine keeps. Demos is written by hand: its pages are page.tsx
// files, which the engine does not index, so none are listed under it.
export const sitemap = createSitemap(import.meta.url, { Overview, Functions, Demos })
