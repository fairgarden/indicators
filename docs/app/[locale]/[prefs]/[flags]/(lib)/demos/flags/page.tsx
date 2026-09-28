import { Inspector } from '@/components/Inspector'
import { indicators } from '@/lib/indicators'
import { mdxComponents } from '@/mdx-components'

const { h1: H1, h2: H2, p: P, code: Code } = mdxComponents

const NAMES: Record<string, string> = {
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  ja: 'Japanese',
  zh: 'Chinese',
}

export default indicators.page(({ flags }) => (
  <>
    <H1>Flags</H1>
    <P>
      A flag is a fact about the request. This one is what the browser asks for first in{' '}
      <Code>Accept-Language</Code>, lumped into a handful of names by a pattern each:{' '}
      <Code>fr.*</Code> is any header that starts with French.
    </P>
    <div className="panel">
      {flags.lang ? (
        <P>
          Your browser asks for <strong>{NAMES[flags.lang] ?? flags.lang}</strong> first. These docs
          are in English — but a page could use this to offer a translation, and it would do so from
          a static page, without reading a header.
        </P>
      ) : (
        <P>
          Your browser asks for English, or a language this site does not list, so the flag is not
          set. Change the browser&apos;s preferred language to French, German, Spanish, Japanese or
          Chinese and reload to see the other case.
        </P>
      )}
    </div>
    <H2>Rendered on demand</H2>
    <P>
      The flag is declared with <Code>prerender: false</Code>, so the build holds no copy of any
      page for it. The first visitor with a French browser has this page rendered for{' '}
      <Code>lang~fr</Code> and cached; the second gets a static page. The variant is the same
      canonical segment as a prerendered one, so nothing else differs.
    </P>
    <H2>Inspector</H2>
    <Inspector />
  </>
))
