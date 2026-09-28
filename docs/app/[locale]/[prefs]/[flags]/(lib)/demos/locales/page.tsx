import { Inspector } from '@/components/Inspector'
import { LocaleSwitcher } from '@/components/LocaleSwitcher'
import { indicators } from '@/lib/indicators'
import { mdxComponents } from '@/mdx-components'

const { h1: H1, h2: H2, p: P, code: Code, table: Table } = mdxComponents

// A fixed moment and fixed quantities, so the two locales format the same thing.
const moment = new Date(Date.UTC(2026, 8, 24, 15, 30))
const celsius = 22
const kilograms = 70

/**
 * Intl formats the unit it is given and never converts, so which system a
 * locale uses is the page's decision. The US measures in Fahrenheit and
 * pounds; the UK measures the weather in Celsius and people in stone.
 */
const systems: Record<
  string,
  { temperature: 'celsius' | 'fahrenheit'; weight: 'pound' | 'stone' }
> = {
  en: { temperature: 'fahrenheit', weight: 'pound' },
  'en-GB': { temperature: 'celsius', weight: 'stone' },
}

const temperature = (unit: 'celsius' | 'fahrenheit'): number =>
  unit === 'celsius' ? celsius : Math.round((celsius * 9) / 5 + 32)
const weight = (unit: 'pound' | 'stone'): number =>
  unit === 'pound' ? Math.round(kilograms * 2.2046) : Math.round(kilograms / 6.3503)

/** What changes between the two locales, formatted by Intl on the server. */
const formatted = (locale: string): Array<[string, string]> => {
  const system = systems[locale] ?? systems.en
  const unit = (unit: string, value: number) =>
    new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'long' }).format(value)
  return [
    [
      'Date',
      new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(moment),
    ],
    ['Short date', new Intl.DateTimeFormat(locale, { timeZone: 'UTC' }).format(moment)],
    [
      'Time',
      new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: 'UTC' }).format(moment),
    ],
    ['Temperature', unit(system.temperature, temperature(system.temperature))],
    ['Body weight', unit(system.weight, weight(system.weight))],
    [
      'Amount',
      new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(1234.5),
    ],
  ]
}

export default indicators.page(({ locale }) => (
  <>
    <H1>Locales</H1>
    <P>
      These docs exist in one language; <Code>en-GB</Code> serves the same pages, so the mechanics
      can be seen working. The default locale stays out of the URL, and every other locale is in it:{' '}
      <Code>/demos/locales</Code> and <Code>/en-GB/demos/locales</Code>.
    </P>
    <div className="panel">
      <LocaleSwitcher />
    </div>
    <H2>What the locale changes</H2>
    <P>
      This page is rendered for <Code>{locale}</Code>, and the locale is a param, so this is a
      separate prerendered copy: what follows was formatted by <Code>Intl</Code> on the server, with
      nothing re-formatted on the client and no flash of the other format. The dates and the amount
      are <Code>Intl</Code>&apos;s own; the units are the page&apos;s decision, since{' '}
      <Code>Intl</Code> formats the unit it is given and never converts — it would spell a distance
      in kilometres for <Code>en-GB</Code> as readily as in kilometers for <Code>en</Code>.
    </P>
    <Table>
      <tbody>
        {formatted(locale).map(([label, value]) => (
          <tr key={label}>
            <th>{label}</th>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </Table>
    <H2>Remembered</H2>
    <P>
      Choosing a locale is a preference, so it is kept in the <Code>locale</Code> cookie. Detection
      never writes it: what the browser asks for is an indicator, acted on for one visit. Pick{' '}
      <strong>en-GB</strong> above, then open the site root — you will be redirected to{' '}
      <Code>/en-GB</Code>, by the proxy, which reads the cookie before <Code>Accept-Language</Code>.
      Pick <strong>en</strong> and the root serves English again. Nothing else on the site looks at
      the cookie: <Code>/demos/locales</Code> is English whoever opens it.
    </P>
    <H2>Inspector</H2>
    <Inspector />
  </>
))
