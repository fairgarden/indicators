import { Inspector } from '@/components/Inspector'
import { ThemeToggle } from '@/components/ThemeToggle'
import { mdxComponents } from '@/mdx-components'

const { h1: H1, h2: H2, p: P, code: Code } = mdxComponents

export default function PrefsDemo() {
  return (
    <>
      <H1>Preferences</H1>
      <P>
        The theme is a preference in the path. A <Code>theme</Code> cookie of <Code>light</Code> or{' '}
        <Code>dark</Code> has this page rewritten to a copy that was prerendered with{' '}
        <Code>data-theme</Code> on <Code>&lt;html&gt;</Code>; without one, the page follows the OS.
      </P>
      <div className="panel">
        <ThemeToggle />
        <P>
          Choosing writes the cookie and refreshes the route. The page that comes back already has
          the attribute, so the switch is one attribute change. Nothing runs on the client to work
          out the theme, so there is nothing to flash.
        </P>
      </div>
      <H2>The test that matters</H2>
      <P>
        Pick <strong>Dark</strong>, then reload the page — hard, with the cache cleared if you like.
        The first frame is dark. The HTML arrived with <Code>data-theme=&quot;dark&quot;</Code> and
        the stylesheet keys off it, so at no point does the browser have a page without the answer.
      </P>
      <P>
        Every page on this site has three prerendered copies for this: no theme, light and dark. The
        build lists them as <Code>/en/-/-/demos/prefs</Code>,{' '}
        <Code>/en/theme~light/-/demos/prefs</Code> and <Code>/en/theme~dark/-/demos/prefs</Code>.
      </P>
      <H2>Inspector</H2>
      <Inspector />
    </>
  )
}
