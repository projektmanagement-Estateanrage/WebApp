import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'

interface Fragment {
  text: string
  x: number
  y: number
  breite: number
}

// Fragmente, deren x-Abstand zum vorherigen Fragment größer ist als diese
// Schwelle (in PDF-Punkten), gelten als eigene Spalte und werden mit einem
// Tab statt einem Leerzeichen getrennt — so bleibt die Blockstruktur
// mehrspaltiger Exposés für die nachgelagerte KI-Extraktion erkennbar.
const SPALTEN_ABSTAND_PT = 12
// Fragmente, deren y-Koordinate um weniger als diese Schwelle abweicht,
// gelten als dieselbe Zeile (PDF-Koordinaten sind nicht immer exakt gleich,
// auch wenn der Text optisch in einer Zeile steht).
const ZEILEN_TOLERANZ_PT = 2

function gruppiereZeilen(fragmente: Fragment[]): Fragment[][] {
  const sortiert = [...fragmente].sort((a, b) => b.y - a.y || a.x - b.x)
  const zeilen: Fragment[][] = []

  for (const frag of sortiert) {
    const letzte = zeilen[zeilen.length - 1]
    if (letzte && Math.abs(letzte[0].y - frag.y) <= ZEILEN_TOLERANZ_PT) {
      letzte.push(frag)
    } else {
      zeilen.push([frag])
    }
  }

  return zeilen.map((zeile) => zeile.sort((a, b) => a.x - b.x))
}

function zeileZuText(zeile: Fragment[]): string {
  let ergebnis = ''
  let vorherigesEnde: number | null = null

  for (const frag of zeile) {
    if (vorherigesEnde !== null) {
      const abstand = frag.x - vorherigesEnde
      ergebnis += abstand > SPALTEN_ABSTAND_PT ? '\t' : ' '
    }
    ergebnis += frag.text
    vorherigesEnde = frag.x + frag.breite
  }

  return ergebnis.trim()
}

export interface PdfSeite {
  seite: number
  text: string
}

export async function parsePdfZuStrukturiertemText(buffer: Buffer): Promise<PdfSeite[]> {
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise
  const seiten: PdfSeite[] = []

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const viewport = page.getViewport({ scale: 1 })

    const fragmente: Fragment[] = content.items
      .filter((item): item is TextItem => 'str' in item && item.str.trim() !== '')
      .map((item) => ({
        text: item.str,
        x: item.transform[4],
        // y in PDF-Koordinaten läuft von unten nach oben; wir drehen sie so,
        // dass "oben auf der Seite" auch numerisch oben (kleiner y) ist.
        y: viewport.height - item.transform[5],
        breite: item.width,
      }))

    const zeilen = gruppiereZeilen(fragmente)
    const text = zeilen.map(zeileZuText).join('\n')

    seiten.push({ seite: i, text })
  }

  return seiten
}
