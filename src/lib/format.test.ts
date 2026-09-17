import { describe, expect, it } from 'vitest'
import { formatEuro, parseEuroInput } from './format'

describe('formatEuro', () => {
  it('formatiert ohne Cent im deutschen Format', () => {
    expect(formatEuro(10665)).toBe('10.665 €')
  })

  it('gibt bei null einen leeren String zurück (kein Preis genannt)', () => {
    expect(formatEuro(null)).toBe('')
  })
})

describe('parseEuroInput', () => {
  it('schneidet Cent ab, rundet nicht', () => {
    expect(parseEuroInput('10665,60')).toBe(10665)
  })

  it('leeres Feld wird null, nicht 0', () => {
    expect(parseEuroInput('')).toBeNull()
  })

  it('Text wie "verkauft" wird null, nicht 0', () => {
    expect(parseEuroInput('verkauft')).toBeNull()
  })
})
