import { Inspector } from '@/components/Inspector'
import { indicators } from '@/lib/indicators'

export default function StaticDemo() {
  const params = indicators.generateStaticParams()
  const sheets = indicators.stylesheets()
  return (
    <>
      <h1>Static generation</h1>
      <p>
        <code>generateStaticParams</code> on the root layout lists every combination the build should
        hold: each locale against each prerendered preference value against each prerendered flag
        value. For this site that is {params.length} per page.
      </p>
      <pre>{params.map((entry) => JSON.stringify(entry)).join('\n')}</pre>
      <p>
        The accent is not there: it is a stylesheet, so it multiplies nothing. The <code>lang</code>{' '}
        flag is not there either: it is declared with <code>prerender: false</code>, so its variants
        wait for a first request and are cached then. Both are still served, as the same canonical
        segments a prerendered copy would have.
      </p>
      <h2>Stylesheets the layout links to</h2>
      <pre>{sheets.map((sheet) => `${sheet.kind}.${sheet.key}  ${sheet.href}`).join('\n')}</pre>
      <h2>Inspector</h2>
      <Inspector />
    </>
  )
}
