import { Stylesheets } from '@fairgarden/indicators'
import { Inspector } from '@/components/Inspector'
import { indicators } from '@/lib/indicators'

/**
 * Each desktop platform and its builds, with the architecture family
 * `Sec-CH-UA-Arch` names and the bitness `Sec-CH-UA-Bitness` names for each.
 */
const DESKTOP = [
  {
    os: 'mac',
    name: 'macOS',
    builds: [
      { arch: 'arm', bitness: '64', label: 'Apple silicon' },
      { arch: 'x86', bitness: '64', label: 'Intel' },
    ],
  },
  {
    os: 'windows',
    name: 'Windows',
    builds: [
      { arch: 'arm', bitness: '64', label: 'Arm64' },
      { arch: 'x86', bitness: '64', label: 'x64' },
      { arch: 'x86', bitness: '32', label: '32-bit' },
    ],
  },
  {
    os: 'linux',
    name: 'Linux',
    builds: [
      { arch: 'arm', bitness: '64', label: 'arm64' },
      { arch: 'arm', bitness: '32', label: 'armhf' },
      { arch: 'x86', bitness: '64', label: 'x86-64' },
    ],
  },
]

const MOBILE = [
  { os: 'android', label: 'Get it on Android' },
  { os: 'ios', label: 'Get it on the App Store' },
]

export default function DownloadDemo() {
  return (
    <>
      <Stylesheets indicators={indicators} only={['os', 'arch', 'bitness']} />
      <h1>Download</h1>
      <p>
        A download button for the platform you are on, chosen without a script. The page is one
        static page with every button in it; a stylesheet picked by your <code>User-Agent</code>{' '}
        hides the others, and two picked by <code>Sec-CH-UA-Arch</code> and{' '}
        <code>Sec-CH-UA-Bitness</code> label the build.
      </p>
      <div className="panel">
        <div className="downloads">
          {DESKTOP.map(({ os, name, builds }) => (
            <a key={os} className="download" data-os={os} href="#every-download">
              Download for {name}
              {builds.map(({ arch, bitness, label }) => (
                <small key={label} data-arch={arch} data-bitness={bitness}>
                  {label}
                </small>
              ))}
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
          <strong className="detected-arch" />. Bitness: <strong className="detected-bitness" />.
        </p>
        <p>
          The readout is CSS: each stylesheet sets a custom property, and <code>content</code>{' '}
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
  bitness: {
    header: 'sec-ch-ua-bitness',
    values: { 64: '"64"', 32: '"32"' },
    stylesheet: '/platform/bitness.css',
    global: false,
  },
}`}</pre>
      <p>
        The first value that matches wins, so Android comes before Linux: Chrome on Android says{' '}
        <code>Linux; Android</code>. Each value is a tiny file in <code>public/platform/</code>:
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
        That hint names the family, not how many bits it has: <code>&quot;x86&quot;</code> is a
        32-bit PC as much as a 64-bit one. <code>Sec-CH-UA-Bitness</code> says which, and comes
        from the same browsers on the same terms. Each build&apos;s label carries both, and each
        stylesheet hides the labels it rules out, so the one left fits both:
      </p>
      <pre>{`<small data-arch="x86" data-bitness="64">x64</small>
<small data-arch="x86" data-bitness="32">32-bit</small>

/* arch.x86.css */
.downloads [data-arch]:not([data-arch="x86"]) { display: none }
/* bitness.64.css */
.downloads [data-bitness]:not([data-bitness="64"]) { display: none }`}</pre>
      <p>
        That is one stylesheet per hint, not one per combination. A platform with no build for it,
        such as 32-bit Arm on Windows, is left with no label rather than a wrong one, and so is a
        browser that sends only one of the two.
      </p>
      <p>
        The guess can be wrong. Safari on an iPad says it is a Mac, and gets the Mac button. So the
        page still lists everything:
      </p>
      <h2 id="every-download">Every download</h2>
      <ul>
        {DESKTOP.map(({ os, name, builds }) => (
          <li key={os}>
            {name}: {builds.map(({ label }) => label).join(', ')}
          </li>
        ))}
        <li>Android and iOS, from their stores</li>
      </ul>
      <h2>What it costs</h2>
      <p>
        None of the three is in the path, so this is one page, not one per platform, and the
        inspector below lists none of them. The cost is three more stylesheets, on this page alone.
        All three are declared <code>global: false</code>, so the layout leaves them out and this
        page links them itself:
      </p>
      <pre>{`<Stylesheets indicators={indicators} only={['os', 'arch', 'bitness']} />`}</pre>
      <p>
        No other page on this site asks for them. Here they are three more tiny requests, in
        parallel with the accent&apos;s, and a 304 each once the browser has them. They are not
        preloaded, since the plugin preloads only what every page links. Arriving here from
        another page without a reload, the navigation waits for them, so the buttons never show
        all at once first. Leaving the same way, they stay in the <code>&lt;head&gt;</code>,
        which is why every rule in them starts at <code>.downloads</code>.
      </p>
      <h2>Inspector</h2>
      <Inspector />
    </>
  )
}
