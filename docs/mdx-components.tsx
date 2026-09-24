import type { MDXComponents } from 'mdx/types'
import type { ComponentProps } from 'react'
import { Link } from './lib/link'

/**
 * Required by `@next/mdx` in the App Router.
 *
 * Links in the pages are written root-relative, `/overview` and the like;
 * rendering them through the site's own `Link` gives them the locale of the
 * page they are on.
 */
const MdxLink = ({ href = '', ...props }: ComponentProps<'a'>) => <Link href={href} {...props} />

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return { ...components, a: MdxLink }
}
