import { BetaSwitch } from '@/components/BetaSwitch'
import { Inspector } from '@/components/Inspector'
import { Link } from '@/lib/link'

export default function HardFlagsDemo() {
  return (
    <>
      <h1>Hard flags</h1>
      <p>
        This is the ordinary version of this page. A <code>beta</code> hard flag is declared in{' '}
        <code>next.config.ts</code>; a request carrying the right cookie is rewritten into a{' '}
        <code>beta/</code> directory beside every page, and this page has a version there.
      </p>
      <div className="panel">
        <BetaSwitch joined={false} />
        <p>
          Joining writes the cookie and refreshes. The same address then serves the other file —
          look for the framed panel.
        </p>
      </div>
      <h2>What a visitor cannot do</h2>
      <p>
        The beta page lives at <code>/en/-/-/beta/demos/hard-flags</code> internally, but{' '}
        <Link href="/beta/demos/hard-flags">/beta/demos/hard-flags</Link> is a 404, with the cookie
        or without: a public path starting with a hard flag&apos;s name is quarantined before the
        segment is injected. The value itself is matched in the rewrites, on the server; this demo
        has to write it from the browser, which an app never would.
      </p>
      <h2>Inspector</h2>
      <Inspector />
    </>
  )
}
