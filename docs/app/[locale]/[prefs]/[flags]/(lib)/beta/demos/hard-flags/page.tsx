import { BetaSwitch } from '@/components/BetaSwitch'
import { Inspector } from '@/components/Inspector'
import { Link } from '@/lib/link'
import { mdxComponents } from '@/mdx-components'

const { h1: H1, h2: H2, p: P, code: Code } = mdxComponents

export default function HardFlagsBetaDemo() {
  return (
    <>
      <H1>Hard flags</H1>
      <div className="panel beta">
        <P>
          <strong>You are in the beta.</strong> This page is{' '}
          <Code>app/[locale]/[prefs]/[flags]/beta/demos/hard-flags/page.tsx</Code>: the address did
          not change, the cookie did, and the rewrites sent the request into the beta tree. It was
          prerendered like any other page, for every locale and theme.
        </P>
        <BetaSwitch joined />
      </div>
      <H2>Pages the beta tree does not have</H2>
      <P>
        Only this page has a beta version. Visit the{' '}
        <Link href="/demos/prefs">preferences demo</Link> now: the request is rewritten to{' '}
        <Code>/en/-/-/beta/demos/prefs</Code>, matches nothing, and a fallback rewrite strips the
        segment so the ordinary page is served. Nothing has to be duplicated into the beta tree.
      </P>
      <H2>Inspector</H2>
      <P>
        The hard segment is not a param, so it does not appear below; the file knows it is the beta
        one by where it is.
      </P>
      <Inspector />
    </>
  )
}
