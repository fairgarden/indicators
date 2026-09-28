import { Stylesheets } from '@fairgarden/indicators'
import { Inspector } from '@/components/Inspector'
import { indicators } from '@/lib/indicators'
import { mdxComponents } from '@/mdx-components'
import HowItIsChosen from './how-it-is-chosen.mdx'
import WhatItCosts from './what-it-costs.mdx'

const { h1: H1, h2: H2, p: P, code: Code, ul: Ul } = mdxComponents

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
      <H1>Download</H1>
      <P>
        A download button for the platform you are on, chosen without a script. The page is one
        static page with every button in it; a stylesheet picked by your <Code>User-Agent</Code>{' '}
        hides the others, and two picked by <Code>Sec-CH-UA-Arch</Code> and{' '}
        <Code>Sec-CH-UA-Bitness</Code> label the build.
      </P>
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
        <P aria-hidden="true">
          Operating system: <strong className="detected-os" />. Architecture:{' '}
          <strong className="detected-arch" />. Bitness: <strong className="detected-bitness" />.
        </P>
        <P>
          The readout is CSS: each stylesheet sets a custom property, and <Code>content</Code>{' '}
          prints it. When nothing matches, every button stays.
        </P>
      </div>
      <HowItIsChosen />
      <H2 id="every-download">Every download</H2>
      <Ul>
        {DESKTOP.map(({ os, name, builds }) => (
          <li key={os}>
            {name}: {builds.map(({ label }) => label).join(', ')}
          </li>
        ))}
        <li>Android and iOS, from their stores</li>
      </Ul>
      <WhatItCosts />
      <H2>Inspector</H2>
      <Inspector />
    </>
  )
}
