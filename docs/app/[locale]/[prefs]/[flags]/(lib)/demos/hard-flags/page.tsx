import { BetaSwitch } from '@/components/BetaSwitch'
import { Inspector } from '@/components/Inspector'
import { Link } from '@/lib/link'
import { mdxComponents } from '@/mdx-components'

const { h1: H1, h2: H2, p: P, code: Code } = mdxComponents

export default function HardFlagsDemo() {
  return (
    <>
      <H1>Hard flags</H1>
      <P>
        This is the ordinary version of this page. A <Code>beta</Code> hard flag is declared in{' '}
        <Code>next.config.ts</Code>; a request carrying the right cookie is rewritten into a{' '}
        <Code>beta/</Code> directory beside every page, and this page has a version there.
      </P>
      <div className="panel">
        <BetaSwitch joined={false} />
        <P>
          Joining writes the cookie and refreshes. The same address then serves the other file —
          look for the framed panel.
        </P>
      </div>
      <H2>What a visitor cannot do</H2>
      <P>
        The beta page lives at <Code>/en/-/-/beta/demos/hard-flags</Code> internally, but{' '}
        <Link href="/beta/demos/hard-flags">/beta/demos/hard-flags</Link> is a 404, with the cookie
        or without: a public path starting with a hard flag&apos;s name is quarantined before the
        segment is injected. The value itself is matched in the rewrites, on the server; this demo
        has to write it from the browser, which an app never would.
      </P>
      <H2>Inspector</H2>
      <Inspector />
    </>
  )
}
