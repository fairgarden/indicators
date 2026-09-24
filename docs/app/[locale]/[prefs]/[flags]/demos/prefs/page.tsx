import { Inspector } from '@/components/Inspector'
import { ThemeToggle } from '@/components/ThemeToggle'

export default function PrefsDemo() {
  return (
    <>
      <h1>Preferences</h1>
      <p>
        The theme is a preference in the path. A <code>theme</code> cookie of <code>light</code> or{' '}
        <code>dark</code> has this page rewritten to a copy that was prerendered with{' '}
        <code>data-theme</code> on <code>&lt;html&gt;</code>; without one, the page follows the OS.
      </p>
      <div className="panel">
        <ThemeToggle />
        <p>
          Choosing writes the cookie and refreshes the route. The page that comes back already has
          the attribute, so the switch is one attribute change. Nothing runs on the client to work
          out the theme, so there is nothing to flash.
        </p>
      </div>
      <h2>The test that matters</h2>
      <p>
        Pick <strong>Dark</strong>, then reload the page — hard, with the cache cleared if you like.
        The first frame is dark. The HTML arrived with <code>data-theme=&quot;dark&quot;</code> and the
        stylesheet keys off it, so at no point does the browser have a page without the answer.
      </p>
      <p>
        Every page on this site has three prerendered copies for this: no theme, light and dark.
        The build lists them as <code>/en/-/-/demos/prefs</code>, <code>/en/theme~light/-/demos/prefs</code>{' '}
        and <code>/en/theme~dark/-/demos/prefs</code>.
      </p>
      <h2>Inspector</h2>
      <Inspector />
    </>
  )
}
