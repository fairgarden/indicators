import { BetaSwitch } from '@/components/BetaSwitch'
import { Inspector } from '@/components/Inspector'
import { Link } from '@/lib/link'

export default function HardFlagsBetaDemo() {
  return (
    <>
      <h1>Hard flags</h1>
      <div className="panel beta">
        <p>
          <strong>You are in the beta.</strong> This page is{' '}
          <code>app/[locale]/[prefs]/[flags]/beta/demos/hard-flags/page.tsx</code>: the address did
          not change, the cookie did, and the rewrites sent the request into the beta tree. It was
          prerendered like any other page, for every locale and theme.
        </p>
        <BetaSwitch joined />
      </div>
      <h2>Pages the beta tree does not have</h2>
      <p>
        Only this page has a beta version. Visit the <Link href="/demos/prefs">preferences demo</Link>{' '}
        now: the request is rewritten to <code>/en/-/-/beta/demos/prefs</code>, matches nothing, and
        a fallback rewrite strips the segment so the ordinary page is served. Nothing has to be
        duplicated into the beta tree.
      </p>
      <h2>Inspector</h2>
      <p>
        The hard segment is not a param, so it does not appear below; the file knows it is the beta
        one by where it is.
      </p>
      <Inspector />
    </>
  )
}
