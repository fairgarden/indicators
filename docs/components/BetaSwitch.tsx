'use client'

import { useRouter } from 'next/navigation'
import { BETA_COOKIE_VALUE } from '@/lib/demo'

/**
 * Joins or leaves the beta cohort by writing the `beta` cookie, then
 * refreshes: the next request is rewritten into the beta tree, or back out
 * of it. A hard flag is not a preference, so this is a cookie by hand.
 */
export function BetaSwitch({ joined }: { joined: boolean }) {
  const router = useRouter()
  const write = (value: string | undefined) => {
    const age = value === undefined ? 0 : 60 * 60 * 24
    document.cookie = `beta=${value ?? ''}; Path=/; Max-Age=${age}; SameSite=Lax`
    router.refresh()
  }
  return (
    <div className="controls">
      {joined ? (
        <button type="button" onClick={() => write(undefined)}>
          Leave the beta
        </button>
      ) : (
        <button type="button" onClick={() => write(BETA_COOKIE_VALUE)}>
          Join the beta
        </button>
      )}
    </div>
  )
}
