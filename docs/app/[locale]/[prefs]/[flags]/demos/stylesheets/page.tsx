import { AccentPicker } from '@/components/AccentPicker'
import { Inspector } from '@/components/Inspector'

export default function StylesheetsDemo() {
  return (
    <>
      <h1>Stylesheets</h1>
      <p>
        The accent is a preference too, but it is not in the path: it is a stylesheet. The root
        layout links to <code>/theme/accent.css</code>, and a request for it is rewritten, by the{' '}
        <code>accent</code> cookie, to one of four one-line files in <code>public/</code>. No page
        has a copy per accent.
      </p>
      <div className="panel">
        <AccentPicker />
        <p>
          Choosing writes the cookie and fetches the stylesheet again — a fresh link with a
          cache-busting query, after the layout&apos;s — so the change shows without a reload.
          The second line reads the answer back out of CSS: what the server chose is what the
          page uses, and a script can read it without parsing a cookie.
        </p>
      </div>
      <h2>What the browser sees</h2>
      <pre>{`GET /theme/accent.css
Cookie: accent=green

HTTP/1.1 200 OK
Cache-Control: private, no-cache, stale-if-error=86400
ETag: W/"..."

:root { --accent: #16a34a; --accent-name: "green" }`}</pre>
      <p>
        <code>no-cache</code> makes the browser ask again on every page, which is a 304 while the
        cookie has not changed and a new file once it has. The file is a line, so a fresh copy is
        barely heavier than the 304. On a reload the link is render-blocking CSS in the head, so
        the first frame has the right accent.
      </p>
      <h2>Inspector</h2>
      <p>
        Notice that the preferences below do not mention the accent. It is not in the path, so it
        is not in the params.
      </p>
      <Inspector />
    </>
  )
}
