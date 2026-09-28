import type { MDXComponents } from 'mdx/types'
import { createMdxComponents } from '@fairgarden/design/utils/docs/createMdxComponents'
import { Link } from './lib/link'

/**
 * The design system's MDX map. Links in the pages are written root-relative,
 * `/overview` and the like; rendering them through the site's own `Link`
 * gives them the locale of the page they are on. `pre` is required: the docs
 * pipeline replaces every fenced code block with `<pre data-precompute=…>`,
 * which only its Code Block can render. Exported so the demo pages, which
 * are TSX, set their text with the same components.
 */
export const mdxComponents = createMdxComponents({ Link })

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return { ...components, ...mdxComponents }
}
