import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parsePdfZuStrukturiertemText } from './pdfParser'

const FIXTURE = path.resolve(__dirname, '../../../fixtures/M4_Preise_ges_V06.pdf')

describe('parsePdfZuStrukturiertemText (M4_Preise_ges_V06.pdf)', () => {
  it('liest alle Seiten mit rekonstruiertem Zeilentext', async () => {
    const buffer = await readFile(FIXTURE)
    const seiten = await parsePdfZuStrukturiertemText(buffer)

    expect(seiten.length).toBeGreaterThan(1)
    for (const seite of seiten) {
      expect(typeof seite.text).toBe('string')
    }
  })

  it('findet bekannte Werte aus dem Exposé wieder (Positionsrekonstruktion funktioniert)', async () => {
    const buffer = await readFile(FIXTURE)
    const seiten = await parsePdfZuStrukturiertemText(buffer)
    const gesamtText = seiten.map((s) => s.text).join('\n')

    // Konkrete Werte aus der Spec: reservierte Wohnungen mit Preis.
    expect(gesamtText).toContain('295.225')
    expect(gesamtText).toContain('299.535')
    // Alle 16 Wohnungsbezeichnungen müssen im Rohtext auftauchen.
    for (let n = 1; n <= 16; n++) {
      const bezeichnung = `W${String(n).padStart(2, '0')}`
      expect(gesamtText).toContain(bezeichnung)
    }
  })

  it('behält Stellplatzoptionen im Rohtext (Aussortierung passiert erst in der KI-Extraktion)', async () => {
    const buffer = await readFile(FIXTURE)
    const seiten = await parsePdfZuStrukturiertemText(buffer)
    const gesamtText = seiten.map((s) => s.text).join('\n')

    expect(gesamtText).toContain('75.000')
    expect(gesamtText).toContain('52.000')
    expect(gesamtText).toContain('20.000')
  })
})
