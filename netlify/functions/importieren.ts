// Background Function (config.background = true): Laufzeit bis zu 15 Minuten
// statt der festen 60s einer synchronen Function — nötig, weil ein
// Claude-Aufruf für eine größere Liste länger dauern kann als die erlaubten
// 60s. Die Datei selbst geht nie durch den Function-Request (Body-Limit einer
// Background Function: 256 KB); der Browser lädt sie direkt in den Storage,
// die Function bekommt nur die importe-ID und holt sich die Datei von dort.
//
// Netlify wiederholt eine fehlgeschlagene Background Function automatisch
// (nach 1 und nach 3 Minuten). Der Statuscheck am Anfang verhindert, dass ein
// bereits abgeschlossener Import (fertig oder fehler) durch so eine
// Wiederholung ein zweites Mal verarbeitet und ein zweites Mal an Claude
// geschickt wird.

import type { Config } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { parseExcelZuStrukturiertemText } from '../../src/server/parsers/excelParser'
import { parsePdfZuStrukturiertemText } from '../../src/server/parsers/pdfParser'
import { extrahiere } from '../../src/server/extraktion'

const EXCEL_ENDUNGEN = new Set(['xlsx', 'xlsm', 'xls'])

async function parseZuRohtext(buffer: Buffer, quelleTyp: string): Promise<string> {
  if (quelleTyp === 'pdf') {
    const seiten = await parsePdfZuStrukturiertemText(buffer)
    return seiten.map((seite) => `=== Seite ${seite.seite} ===\n${seite.text}`).join('\n\n')
  }
  if (EXCEL_ENDUNGEN.has(quelleTyp)) {
    const blaetter = await parseExcelZuStrukturiertemText(buffer)
    return blaetter
      .map((blatt) => `=== Tabellenblatt: ${blatt.name} ===\n${blatt.zeilen.join('\n')}`)
      .join('\n\n')
  }
  throw new Error(`Unbekannter quelle_typ: "${quelleTyp}"`)
}

export default async (req: Request) => {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!supabaseUrl || !serviceRoleKey || !anthropicKey) {
    console.error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY oder ANTHROPIC_API_KEY fehlt in der Umgebung.')
    return new Response('Server-Konfiguration unvollständig', { status: 500 })
  }

  const { importeId } = (await req.json()) as { importeId?: string }
  if (!importeId) return new Response('importeId fehlt', { status: 400 })

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const { data: importZeile, error: ladeFehler } = await supabase
    .from('importe')
    .select('*')
    .eq('id', importeId)
    .single()

  if (ladeFehler || !importZeile) {
    console.error(`importe-Zeile ${importeId} nicht gefunden:`, ladeFehler?.message)
    return new Response('importe-Zeile nicht gefunden', { status: 404 })
  }

  // Schutz gegen Netlifys automatischen Retry: ein schon abgeschlossener
  // Import wird nicht nochmal verarbeitet (und nicht nochmal an Claude
  // geschickt).
  if (importZeile.status === 'fertig' || importZeile.status === 'fehler') {
    return new Response('Bereits abgeschlossen, kein erneuter Lauf.', { status: 200 })
  }

  try {
    const { data: datei, error: downloadFehler } = await supabase.storage
      .from('importe')
      .download(importZeile.storage_pfad)
    if (downloadFehler) throw new Error(`Storage-Download fehlgeschlagen: ${downloadFehler.message}`)

    const buffer = Buffer.from(await datei.arrayBuffer())
    const rohtext = await parseZuRohtext(buffer, importZeile.quelle_typ)

    await supabase.from('importe').update({ status: 'wird_erkannt', roh_text: rohtext }).eq('id', importeId)

    const { rohantwort, ergebnis } = await extrahiere(rohtext, anthropicKey)
    void rohantwort // Rohantwort steckt vollständig in modell_antwort/hinweise; kein separates Feld in importe für den Wortlaut nötig.

    await supabase
      .from('importe')
      .update({
        status: 'fertig',
        modell_antwort: { einheiten: ergebnis.einheiten, summenZeile: ergebnis.summenZeile },
        hinweise: ergebnis.hinweise,
      })
      .eq('id', importeId)

    return new Response('OK', { status: 200 })
  } catch (e) {
    const nachricht = e instanceof Error ? e.message : String(e)
    console.error(`Import ${importeId} fehlgeschlagen:`, nachricht)
    await supabase.from('importe').update({ status: 'fehler', fehler: nachricht }).eq('id', importeId)
    return new Response(nachricht, { status: 500 })
  }
}

export const config: Config = {
  background: true,
}
