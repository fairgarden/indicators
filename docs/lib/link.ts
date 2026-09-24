'use client'

import { createNavigation } from '@fairgarden/indicators/link'
import { indicators } from './indicators'

// Use these instead of next/link, so hrefs carry the locale of the page
// they are on.
export const { Link, useHref, useIndicators, useLocale, useSetLocale, usePref } =
  createNavigation(indicators)
