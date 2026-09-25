import { Stylesheets } from '@fairgarden/indicators'
import { Inspector } from '@/components/Inspector'
import { indicators } from '@/lib/indicators'

/** Each desktop build, with what its two architectures are called. */
const DESKTOP = [
  { os: 'mac', name: 'macOS', arm: 'Apple silicon', x86: 'Intel' },
  { os: 'windows', name: 'Windows', arm: 'Arm', x86: 'x64' },
  { os: 'linux', name: 'Linux', arm: 'arm64', x86: 'x86-64' },
]

const MOBILE = [
  { os: 'android', label: 'Get it on Android' },
  { os: 'ios', label: 'Get it on the App Store' },
]

export default function DownloadDemo() {
  return (
    <>
      <Stylesheets indicators={indicators} only={['os', 'arch']} />
      <h1>Download</h1>
      <p>
        A download button for the platform you are on, chosen without a script. The page is one
        static page with every button in it; a stylesheet picked by your <code>User-Agent</code>{' '}
        hides the others, and one picked by <code>Sec-CH-UA-Arch</code> labels the build.
      </p>
      <div className="panel">
        <div className="downloads">
          {DESKTOP.map(({ os, name, arm, x86 }) => (
            <a key={os} className="download" data-os={os} href="#every-download">
              Download for {name}
              <small data-arch="arm">{arm}</small>
              <small data-arch="x86">{x86}</small>
            </a>
          ))}
          {MOBILE.map(({ os, label }) => (
            <a key={os} className="download" data-os={os} href="#every-download">
              {label}
            </a>
          ))}
        </div>
        {/* CSS content, which not every screen reader reads; the button says the same. */}
        <p aria-hidden="true">
          Operating system: <strong className="detected-os" />. Architecture:{' '}
          <strong className="detected-arch" />.
        </p>
        <p>
          Both lines are CSS: each stylesheet sets a custom property, and <code>content</code>{' '}
          prints it. When nothing matches, every button stays.
        </p>
      </div>
      <h2>How it is chosen</h2>
      <pre>{`flags: {
  os: {
    header: 'user-agent',
    values: {
      android: '.*Android.*',
      ios: '.*(?:iPhone|iPad).*',
      mac: '.*Macintosh.*',
      windows: '.*Windows.*',
      linux: '.*Linux.*',
    },
    stylesheet: '/platform/os.css',
    global: false,
  },
  arch: {
    header: 'sec-ch-ua-arch',
    values: { arm: '"arm"', x86: '"x86"' },
    stylesheet: '/platform/arch.css',
    global: false,
  },
}`}</pre>
      <p>
        The first value that matches wins, so Android comes before Linux: Chrome on Android says{' '}
        <code>Linux; Android</code>. Each value is a one-line file in <code>public/platform/</code>:
      </p>
      <pre>{`GET /platform/os.css
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) …

:root { --os: "macOS" }
.downloads [data-os]:not([data-os="mac"]) { display: none }`}</pre>
      <p>
        Every browser sends <code>User-Agent</code>, so the operating system works everywhere. It
        cannot tell the architecture: every Mac says <code>Intel Mac OS X</code>, Apple silicon
        included. <code>Sec-CH-UA-Arch</code> can, but only Chromium sends it, and only once the
        site asks with <code>Accept-CH</code>, which the plugin does on every page. The stylesheet
        is requested by the page that asked, so it has the hint on the first visit. In Firefox and
        Safari the button has no architecture on it.
      </p>
      <p>
        The guess can be wrong. Safari on an iPad says it is a Mac, and gets the Mac button. So the
        page still lists everything:
      </p>
      <h2 id="every-download">Every download</h2>
      <ul>
        {DESKTOP.map(({ os, name, arm, x86 }) => (
          <li key={os}>
            {name}: {arm} or {x86}
          </li>
        ))}
        <li>Android and iOS, from their stores</li>
      </ul>
      <h2>What it costs</h2>
      <p>
        Neither indicator is in the path, so this is one page, not one per platform, and the
        inspector below lists neither. The cost is two more stylesheets, on this page alone. Both
        are declared <code>global: false</code>, so the layout leaves them out and this page links
        them itself:
      </p>
      <pre>{`<Stylesheets indicators={indicators} only={['os', 'arch']} />`}</pre>
      <p>
        No other page on this site asks for them. Here they are two more one-line requests, in
        parallel with the accent&apos;s, and a 304 each once the browser has them. They are not
        preloaded, since the plugin preloads only what every page links. Arriving here from
        another page without a reload, the navigation waits for them, so the buttons never show
        all at once first.
      </p>
      <h2>Inspector</h2>
      <Inspector />
    </>
  )
}
