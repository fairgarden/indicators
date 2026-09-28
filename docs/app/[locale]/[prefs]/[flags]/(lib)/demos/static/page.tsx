import { Inspector } from '@/components/Inspector'
import { Link } from '@/lib/link'
import { indicators } from '@/lib/indicators'
import { mdxComponents } from '@/mdx-components'

const { h1: H1, h2: H2, p: P, code: Code, ul: Ul } = mdxComponents

export default function StaticDemo() {
  const params = indicators.generateStaticParams()
  const sheets = (global: boolean) =>
    indicators
      .stylesheets()
      .filter((sheet) => sheet.global === global)
      .map((sheet) => `${sheet.kind}.${sheet.key}  ${sheet.href}`)
  // Each generated line, in the design system's inline code.
  const lines = (entries: string[]) => (
    <Ul>
      {entries.map((entry) => (
        <li key={entry}>
          <Code>{entry}</Code>
        </li>
      ))}
    </Ul>
  )
  return (
    <>
      <H1>Static generation</H1>
      <P>
        <Code>generateStaticParams</Code> on the root layout lists every combination the build
        should hold: each locale against each prerendered preference value against each prerendered
        flag value. For this site that is {params.length} per page.
      </P>
      {lines(params.map((entry) => JSON.stringify(entry)))}
      <P>
        The accent is not there: it is a stylesheet, so it multiplies nothing. The <Code>lang</Code>{' '}
        flag is not there either: it is declared with <Code>prerender: false</Code>, so its variants
        wait for a first request and are cached then. Both are still served, as the same canonical
        segments a prerendered copy would have.
      </P>
      <H2>Stylesheets the layout links to</H2>
      {lines(sheets(true))}
      <H2>Stylesheets the pages that use them link to</H2>
      <P>
        Declared <Code>global: false</Code>, so the layout leaves them out and only the{' '}
        <Link href="/demos/download">download demo</Link> links them.
      </P>
      {lines(sheets(false))}
      <H2>Inspector</H2>
      <Inspector />
    </>
  )
}
