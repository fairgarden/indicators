import { AccentPicker } from '@/components/AccentPicker'
import { Inspector } from '@/components/Inspector'
import { mdxComponents } from '@/mdx-components'
import WhatTheBrowserSees from './what-the-browser-sees.mdx'

const { h1: H1, h2: H2, p: P, code: Code } = mdxComponents

export default function StylesheetsDemo() {
  return (
    <>
      <H1>Stylesheets</H1>
      <P>
        The accent is a preference too, but it is not in the path: it is a stylesheet. The root
        layout links to <Code>/theme/accent.css</Code>, and a request for it is rewritten, by the{' '}
        <Code>accent</Code> cookie, to one of four one-line files in <Code>public/</Code>. No page
        has a copy per accent.
      </P>
      <div className="panel">
        <AccentPicker />
        <P>
          Choosing writes the cookie and fetches the stylesheet again — a fresh link with a
          cache-busting query, after the layout&apos;s — so the change shows without a reload. The
          second line reads the answer back out of CSS: what the server chose is what the page uses,
          and a script can read it without parsing a cookie.
        </P>
      </div>
      <WhatTheBrowserSees />
      <H2>Inspector</H2>
      <P>
        Notice that the preferences below do not mention the accent. It is not in the path, so it is
        not in the params.
      </P>
      <Inspector />
    </>
  )
}
