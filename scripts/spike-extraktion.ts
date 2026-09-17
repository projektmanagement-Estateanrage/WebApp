// Spike: beweist, ob Parser + Extraktion tragen, bevor die Oberfläche
// weitergebaut wird. Kein UI, keine DB, keine Migration. Darf hässlich sein,
// muss ehrlich sein.
//
// Aufruf: npx tsx scripts/spike-extraktion.ts fixtures/<datei>
//
// Was landet in netlify/functions und was war Wegwerfcode, steht am Ende der
// Konsolenausgabe unter "Fazit".

import 'dotenv/config'
import { config as loadEnv } from 'dotenv'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseExcelZuStrukturiertemText } from '../src/server/parsers/excelParser'
import { parsePdfZuStrukturiertemText } from '../src/server/parsers/pdfParser'
import {
  extrahiere as extrahiereGemeinsam,
  MODELL,
  type ExtrahierteEinheit,
  type ExtraktionsErgebnis,
} from '../src/server/extraktion'
import {
  formatEuro,
  formatFlaeche,
  parseGroesseZuHundertstel,
  summeHundertstel,
  summeKaufpreise,
} from '../src/lib/zahlen'

// .env.local hat Vorrang vor einer eventuell vorhandenen .env — dort liegt
// der Anthropic-Key laut Vorgabe.
loadEnv({ path: '.env.local', override: true })

interface ErwarteteDatei {
  aggregate?: {
    anzahlWohnungen?: number
    wohnflaecheGesamtM2?: number
    kaufpreisGesamt?: number | null
    typAnzahl?: Record<string, number>
  }
  summenZeileErwartet?: { flaeche: number | null; kaufpreis: number | null } | null
  einheiten?: Array<Partial<ExtrahierteEinheit> & { bezeichnung: string }>
  verboteneBezeichnungen?: string[]
  hinweiseErwartetSubstrings?: string[]
}

function erkenneFormat(dateipfad: string): 'excel' | 'pdf' {
  const ext = path.extname(dateipfad).toLowerCase()
  if (ext === '.pdf') return 'pdf'
  if (['.xlsx', '.xlsm', '.xls'].includes(ext)) return 'excel'
  throw new Error(`Unbekanntes Dateiformat: ${ext}`)
}

async function parseZuRohtext(dateipfad: string, format: 'excel' | 'pdf'): Promise<string> {
  const buffer = await readFile(dateipfad)

  if (format === 'excel') {
    const blaetter = await parseExcelZuStrukturiertemText(buffer)
    return blaetter
      .map((blatt) => `=== Tabellenblatt: ${blatt.name} ===\n${blatt.zeilen.join('\n')}`)
      .join('\n\n')
  }

  const seiten = await parsePdfZuStrukturiertemText(buffer)
  return seiten.map((seite) => `=== Seite ${seite.seite} ===\n${seite.text}`).join('\n\n')
}

async function extrahiere(rohtext: string): Promise<{ rohantwort: string; ergebnis: ExtraktionsErgebnis }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY fehlt in .env.local. Kein Fallback, kein Mock — Key eintragen und erneut versuchen.',
    )
  }
  return extrahiereGemeinsam(rohtext, apiKey)
}

function druckeTabelle(einheiten: ExtrahierteEinheit[]) {
  if (einheiten.length === 0) {
    console.log('(keine Einheiten erkannt)')
    return
  }
  const spalten: Array<[keyof ExtrahierteEinheit, string]> = [
    ['bezeichnung', 'Bezeichnung'],
    ['typ', 'Typ'],
    ['etage', 'Etage'],
    ['zimmer', 'Zi'],
    ['groesse', 'Größe'],
    ['kaufpreis', 'Kaufpreis'],
    ['status', 'Status'],
    ['garage', 'Garage'],
    ['stellplatz', 'Stellplatz'],
  ]
  const zeilen = einheiten.map((e) =>
    spalten.map(([feld]) => {
      const wert = e[feld]
      if (wert === null || wert === undefined) return ''
      if (feld === 'kaufpreis') return formatEuro(wert as number)
      if (typeof wert === 'boolean') return wert ? 'ja' : ''
      return String(wert)
    }),
  )
  const breiten = spalten.map(([, label], i) =>
    Math.max(label.length, ...zeilen.map((z) => z[i].length)),
  )
  const zeileFormatieren = (werte: string[]) =>
    werte.map((w, i) => w.padEnd(breiten[i])).join('  ')

  console.log(zeileFormatieren(spalten.map(([, label]) => label)))
  console.log(breiten.map((b) => '-'.repeat(b)).join('  '))
  for (const zeile of zeilen) console.log(zeileFormatieren(zeile))
}

function berechneAggregate(einheiten: ExtrahierteEinheit[]) {
  const wohnungen = einheiten.filter((e) => e.typ === 'wohnung')
  const flaecheHundertstel = summeHundertstel(wohnungen.map((e) => parseGroesseZuHundertstel(e.groesse)))
  const kaufpreis = summeKaufpreise(einheiten.map((e) => e.kaufpreis))
  const typAnzahl: Record<string, number> = {}
  for (const e of einheiten) typAnzahl[e.typ] = (typAnzahl[e.typ] ?? 0) + 1

  return {
    anzahlWohnungen: wohnungen.length,
    wohnflaecheGesamtM2: flaecheHundertstel / 100,
    kaufpreisGesamt: kaufpreis,
    typAnzahl,
  }
}

function vergleicheMitErwartung(
  ergebnis: ExtraktionsErgebnis,
  erwartet: ErwarteteDatei,
): string[] {
  const abweichungen: string[] = []
  const aggregate = berechneAggregate(ergebnis.einheiten)

  if (erwartet.aggregate?.anzahlWohnungen !== undefined) {
    if (aggregate.anzahlWohnungen !== erwartet.aggregate.anzahlWohnungen) {
      abweichungen.push(
        `Anzahl Wohnungen: erwartet ${erwartet.aggregate.anzahlWohnungen}, erhalten ${aggregate.anzahlWohnungen}`,
      )
    }
  }

  if (erwartet.aggregate?.wohnflaecheGesamtM2 !== undefined) {
    const diff = aggregate.wohnflaecheGesamtM2 - erwartet.aggregate.wohnflaecheGesamtM2
    if (Math.abs(diff) > 0.05) {
      abweichungen.push(
        `Wohnfläche gesamt: erwartet ${erwartet.aggregate.wohnflaecheGesamtM2} m², erhalten ${formatFlaeche(
          Math.round(aggregate.wohnflaecheGesamtM2 * 100),
        )} m² (Differenz ${diff.toFixed(2)} m²)`,
      )
    }
  }

  if (erwartet.aggregate?.kaufpreisGesamt !== undefined && erwartet.aggregate.kaufpreisGesamt !== null) {
    const diff = aggregate.kaufpreisGesamt.summe - erwartet.aggregate.kaufpreisGesamt
    if (Math.abs(diff) > 1) {
      abweichungen.push(
        `Kaufpreissumme: erwartet ${formatEuro(erwartet.aggregate.kaufpreisGesamt)}, erhalten ${formatEuro(
          aggregate.kaufpreisGesamt.summe,
        )} (Differenz ${formatEuro(diff)})`,
      )
    }
  }

  if (erwartet.aggregate?.typAnzahl) {
    for (const [typ, anzahl] of Object.entries(erwartet.aggregate.typAnzahl)) {
      const erhalten = aggregate.typAnzahl[typ] ?? 0
      if (erhalten !== anzahl) {
        abweichungen.push(`Anzahl Typ "${typ}": erwartet ${anzahl}, erhalten ${erhalten}`)
      }
    }
  }

  if (erwartet.summenZeileErwartet === null && ergebnis.summenZeile !== null) {
    abweichungen.push(
      `summenZeile: erwartet null (Quelle hat keine Summenzeile), erhalten ${JSON.stringify(ergebnis.summenZeile)} — das Modell hat selbst addiert statt die Abwesenheit zu melden.`,
    )
  } else if (erwartet.summenZeileErwartet && ergebnis.summenZeile) {
    if (
      erwartet.summenZeileErwartet.flaeche !== null &&
      Math.abs((ergebnis.summenZeile.flaeche ?? 0) - erwartet.summenZeileErwartet.flaeche) > 0.05
    ) {
      abweichungen.push(
        `summenZeile.flaeche: erwartet ${erwartet.summenZeileErwartet.flaeche}, erhalten ${ergebnis.summenZeile.flaeche}`,
      )
    }
    if (
      erwartet.summenZeileErwartet.kaufpreis !== null &&
      Math.abs((ergebnis.summenZeile.kaufpreis ?? 0) - erwartet.summenZeileErwartet.kaufpreis) > 1
    ) {
      abweichungen.push(
        `summenZeile.kaufpreis: erwartet ${erwartet.summenZeileErwartet.kaufpreis}, erhalten ${ergebnis.summenZeile.kaufpreis}`,
      )
    }
  }

  for (const erwarteteEinheit of erwartet.einheiten ?? []) {
    const gefunden = ergebnis.einheiten.find((e) => e.bezeichnung === erwarteteEinheit.bezeichnung)
    if (!gefunden) {
      abweichungen.push(`Einheit "${erwarteteEinheit.bezeichnung}": erwartet, aber nicht gefunden`)
      continue
    }
    for (const [feld, erwarteterWert] of Object.entries(erwarteteEinheit)) {
      if (feld === 'bezeichnung') continue
      const tatsaechlicherWert = gefunden[feld as keyof ExtrahierteEinheit]
      if (feld === 'kaufpreis' && typeof erwarteterWert === 'number') {
        if (Math.abs(((tatsaechlicherWert as number) ?? 0) - erwarteterWert) > 1) {
          abweichungen.push(
            `${erwarteteEinheit.bezeichnung}.${feld}: erwartet ${erwarteterWert}, erhalten ${tatsaechlicherWert}`,
          )
        }
        continue
      }
      if (tatsaechlicherWert !== erwarteterWert) {
        abweichungen.push(
          `${erwarteteEinheit.bezeichnung}.${feld}: erwartet ${JSON.stringify(erwarteterWert)}, erhalten ${JSON.stringify(tatsaechlicherWert)}`,
        )
      }
    }
  }

  for (const verboten of erwartet.verboteneBezeichnungen ?? []) {
    const treffer = ergebnis.einheiten.find((e) => e.bezeichnung.includes(verboten))
    if (treffer) {
      abweichungen.push(
        `Verbotene Einheit aufgetaucht: "${treffer.bezeichnung}" enthält "${verboten}" — Stellplatzoption wurde fälschlich als Einheit übernommen.`,
      )
    }
  }

  for (const substring of erwartet.hinweiseErwartetSubstrings ?? []) {
    const gefunden = ergebnis.hinweise.some((h) => h.includes(substring))
    if (!gefunden) {
      abweichungen.push(`Hinweis mit "${substring}" erwartet, aber in den Hinweisen nicht gefunden.`)
    }
  }

  return abweichungen
}

async function main() {
  const dateipfad = process.argv[2]
  if (!dateipfad) {
    console.error('Aufruf: npx tsx scripts/spike-extraktion.ts <pfad-zur-datei>')
    process.exit(1)
  }

  const format = erkenneFormat(dateipfad)
  const basisname = path.basename(dateipfad).replace(/\.[^.]+$/, '')

  console.log(`\n=== 1-3) Parsen (${format}) ===`)
  const rohtext = await parseZuRohtext(dateipfad, format)
  await mkdir('out', { recursive: true })
  const txtPfad = path.join('out', `${basisname}.txt`)
  await writeFile(txtPfad, rohtext, 'utf-8')
  console.log(`Zwischentext geschrieben: ${txtPfad} (${rohtext.length} Zeichen)`)

  const farbmarkerAnzahl = (rohtext.match(/\[FARBE:/g) ?? []).length
  console.log(`Farbmarker im Zwischentext: ${farbmarkerAnzahl}`)
  if (format === 'excel' && farbmarkerAnzahl === 0) {
    console.error(
      '\n!!! ABBRUCH: Kein einziger [FARBE:...]-Marker im Zwischentext trotz Excel-Quelle.\n' +
        'exceljs liefert hier keine Füllfarben — das ist das wichtigste Ergebnis des Spikes.\n' +
        'Nicht am Prompt weiterfeilen, bevor das geklärt ist.\n',
    )
    process.exit(2)
  }

  console.log(`\n=== 4-5) Extraktion über ${MODELL} ===`)
  const { rohantwort, ergebnis } = await extrahiere(rohtext)
  const jsonPfad = path.join('out', `${basisname}.json`)
  await writeFile(jsonPfad, rohantwort, 'utf-8')
  console.log(`Rohantwort geschrieben: ${jsonPfad}`)

  console.log(`\n=== 6) Erkannte Einheiten (${ergebnis.einheiten.length}) ===`)
  druckeTabelle(ergebnis.einheiten)

  console.log(`\n=== Hinweise des Modells (${ergebnis.hinweise.length}) ===`)
  for (const h of ergebnis.hinweise) console.log(`- ${h}`)

  const aggregate = berechneAggregate(ergebnis.einheiten)
  console.log(`\n=== Summen ===`)
  console.log(`Wohnfläche (nur Typ wohnung): ${formatFlaeche(Math.round(aggregate.wohnflaecheGesamtM2 * 100))} m²`)
  console.log(
    `Kaufpreissumme: ${formatEuro(aggregate.kaufpreisGesamt.summe)} über ${aggregate.kaufpreisGesamt.anzahlMitPreis} von ${aggregate.kaufpreisGesamt.anzahlGesamt} Einheiten`,
  )
  console.log(`Typen: ${JSON.stringify(aggregate.typAnzahl)}`)
  console.log(`summenZeile aus der Quelle laut Modell: ${JSON.stringify(ergebnis.summenZeile)}`)

  const erwartetPfad = path.join(
    path.dirname(dateipfad),
    `${path.basename(dateipfad).replace(/\.[^.]+$/, '')}.erwartet.json`,
  )
  try {
    const erwartetRoh = await readFile(erwartetPfad, 'utf-8')
    const erwartet: ErwarteteDatei = JSON.parse(erwartetRoh)
    console.log(`\n=== 7) Abgleich gegen ${erwartetPfad} ===`)
    const abweichungen = vergleicheMitErwartung(ergebnis, erwartet)
    if (abweichungen.length === 0) {
      console.log('Keine Abweichungen.')
    } else {
      console.log(`${abweichungen.length} Abweichung(en):`)
      for (const a of abweichungen) console.log(`- ${a}`)
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log(`\n(Keine Erwartungsdatei ${erwartetPfad}, Abgleich übersprungen.)`)
    } else {
      throw e
    }
  }
}

main().catch((err) => {
  console.error('\nFehler:', err instanceof Error ? err.message : err)
  process.exit(1)
})
