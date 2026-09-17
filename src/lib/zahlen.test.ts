import { describe, expect, it } from 'vitest'
import {
  formatEuro,
  formatEuroSigned,
  formatFlaeche,
  formatFlaecheSigned,
  parseEuroInput,
  parseGermanDecimal,
  parseGroesseZuHundertstel,
  summeHundertstel,
  summeKaufpreise,
  vergleicheMitToleranz,
} from './zahlen'

describe('parseEuroInput / formatEuro', () => {
  it('10.665,60 € eingetippt wird als 10.665 € gespeichert und angezeigt (Cent abgeschnitten, nicht gerundet)', () => {
    const gespeichert = parseEuroInput('10665,60')
    expect(gespeichert).toBe(10665)
    expect(formatEuro(gespeichert)).toBe('10.665 €')
  })

  it('10.665,99 € wird trotzdem zu 10.665 € (kein Aufrunden)', () => {
    expect(parseEuroInput('10665,99')).toBe(10665)
  })

  it('leeres Feld wird null, nicht 0', () => {
    expect(parseEuroInput('')).toBeNull()
    expect(formatEuro(null)).toBe('')
  })

  it('explizit eingetippte 0 bleibt von leer unterscheidbar', () => {
    expect(parseEuroInput('0')).toBe(0)
    expect(formatEuro(0)).toBe('0 €')
  })

  it('Text wie "verkauft" wird null, nicht 0', () => {
    expect(parseEuroInput('verkauft')).toBeNull()
  })
})

describe('formatEuroSigned', () => {
  it('positive Abweichung bekommt ein Plus', () => {
    expect(formatEuroSigned(1234)).toBe('+1.234 €')
  })
  it('negative Abweichung behält ihr Minus', () => {
    expect(formatEuroSigned(-567)).toBe('-567 €')
  })
  it('keine Abweichung zeigt 0 € ohne Vorzeichen', () => {
    expect(formatEuroSigned(0)).toBe('0 €')
  })
})

describe('summeKaufpreise', () => {
  it('Einheiten ohne Kaufpreis (null) werden ausgenommen, nicht als 0 gezählt', () => {
    const ergebnis = summeKaufpreise([299535, null, 262442, null, 638799])
    expect(ergebnis.summe).toBe(1200776)
    expect(ergebnis.anzahlMitPreis).toBe(3)
    expect(ergebnis.anzahlGesamt).toBe(5)
  })

  it('nur null-Werte ergeben eine Summe von 0 über 0 von n Einheiten', () => {
    const ergebnis = summeKaufpreise([null, null])
    expect(ergebnis).toEqual({ summe: 0, anzahlMitPreis: 0, anzahlGesamt: 2 })
  })
})

describe('parseGermanDecimal', () => {
  it('parst deutsches Dezimalkomma', () => {
    expect(parseGermanDecimal('43,10 qm')).toBe(43.1)
  })
  it('parst Tausenderpunkt plus Dezimalkomma', () => {
    expect(parseGermanDecimal('1.038,55 m²')).toBe(1038.55)
  })
  it('ohne erkennbare Zahl gibt es null', () => {
    expect(parseGermanDecimal('unbekannt')).toBeNull()
  })
})

describe('parseGroesseZuHundertstel / summeHundertstel / formatFlaeche', () => {
  it('summiert ohne Floating-Point-Drift', () => {
    const werte = [parseGroesseZuHundertstel('43,10 qm'), parseGroesseZuHundertstel('91,91 qm')]
    const summe = summeHundertstel(werte)
    // Direkte Float-Addition ergäbe 135.00999999999999 statt 135.01.
    expect(summe).toBe(13501)
    expect(formatFlaeche(summe)).toBe('135,01')
  })

  it('nicht parsbare Größen liefern null und zählen nicht mit', () => {
    expect(parseGroesseZuHundertstel(null)).toBeNull()
    expect(parseGroesseZuHundertstel('siehe Plan')).toBeNull()
  })
})

describe('formatFlaecheSigned', () => {
  it('positive Abweichung mit Plus', () => {
    expect(formatFlaecheSigned(320)).toBe('+3,20 m²')
  })
  it('negative Abweichung mit Minus', () => {
    expect(formatFlaecheSigned(-105)).toBe('-1,05 m²')
  })
})

describe('vergleicheMitToleranz', () => {
  it('ohne Sollwert gibt es keinen Abgleich', () => {
    expect(vergleicheMitToleranz(100, null, 1)).toEqual({ status: 'kein_soll', differenz: 0 })
  })
  it('Differenz innerhalb der Toleranz gilt als Übereinstimmung', () => {
    const ergebnis = vergleicheMitToleranz(1038.6, 1038.55, 0.05)
    expect(ergebnis.status).toBe('uebereinstimmung')
  })
  it('Differenz außerhalb der Toleranz gilt als Abweichung, mit Vorzeichen der Differenz', () => {
    const ergebnis = vergleicheMitToleranz(1040, 1038.55, 0.05)
    expect(ergebnis.status).toBe('abweichung')
    expect(ergebnis.differenz).toBeCloseTo(1.45)
  })
})
