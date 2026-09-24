// Registers the hook below for every test process.
//
// `next/link`, `next/navigation` and `next/server` are root files of the next
// package with no `exports` map, which a bundler resolves by adding `.js` and
// Node's ESM loader does not. The source keeps the bare specifiers, because
// Next aliases those to layer-specific builds (the App Router `Link`, the
// react-server `navigation`); only the tests, which run in plain Node, need
// help.
import { register } from 'node:module'

register('./resolve-next-hooks.mjs', import.meta.url)
