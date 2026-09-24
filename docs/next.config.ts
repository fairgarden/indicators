import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import createMDX from '@next/mdx'
import type { NextConfig } from 'next'
import { withFairGardenIndicators } from '@fairgarden/indicators/withFairGardenIndicators'
// With the extension: Next loads this file with Node itself, which resolves
// a relative import only when it has one.
import { indicators } from './lib/indicators.ts'
import { BETA_COOKIE_VALUE } from './lib/demo.ts'

// Turbopack resolves nothing outside its root, which it puts at the nearest
// lockfile or repository: this module's own. Installed from a distribution,
// `next` and the other dependencies live in the distribution's store above
// it, so the root is the directory whose node_modules holds the `next` this
// site resolves: the module on its own, or the distribution around it.
const nextPackage = realpathSync(
  createRequire(path.join(process.cwd(), 'package.json')).resolve('next/package.json')
)
const installRoot = nextPackage.slice(
  0,
  nextPackage.indexOf(`${path.sep}node_modules${path.sep}`)
)

const nextConfig: NextConfig = {
  // `.mdx` is not a route on its own; Next only picks these up once the
  // extension is listed here and the loader below is attached.
  pageExtensions: ['ts', 'tsx', 'mdx'],
  turbopack: { root: installRoot },
}

// The site runs the library it documents: every page is served through the
// rewrites, and the demos are the real thing.
export default withFairGardenIndicators(createMDX()(nextConfig), indicators, {
  hardFlags: { beta: { values: [BETA_COOKIE_VALUE] } },
})
