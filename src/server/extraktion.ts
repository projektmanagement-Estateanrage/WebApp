// Unverändert aus dem Extraktions-Spike übernommen (scripts/spike-extraktion.ts,
// verifiziert gegen M4_Preise_ges_V06.pdf: 16 Einheiten, 0 Abweichungen).
// Modell, System-Prompt, JSON-Bereinigung und Typen bleiben hier zentral, damit
// Spike und Netlify-Function exakt denselben Code verwenden — nichts davon wird
// neu geschrieben oder "verbessert".

import Anthropic from '@anthropic-ai/sdk'

export const MODELL = 'claude-sonnet-4-6'

export type EinheitTyp = 'wohnung' | 'stellplatz' | 'garage' | 'gewerbe' | 'sonstiges'
export type EinheitStatus = 'frei' | 'reserviert' | 'verkauft'

export interface ExtrahierteEinheit {
  bezeichnung: string
  typ: EinheitTyp
  etage: string | null
  zimmer: string | null
  groesse: string | null
  kaufpreis: number | null
  kaltmiete: number | null
  status: EinheitStatus | null
  garage: boolean
  garagePreis: number | null
  stellplatz: boolean
  stellplatzPreis: number | null
  hinweis: string | null
}

export interface ExtraktionsErgebnis {
  einheiten: ExtrahierteEinheit[]
  hinweise: string[]
  summenZeile: { flaeche: number | null; kaufpreis: number | null } | null
}

export const SYSTEM_PROMPT = `Du extrahierst Einheiten aus der Preisliste eines Bauträgers. Der Text stammt
aus einem automatischen Parser (Excel-Zellen mit "|" getrennt und ggf.
"[FARBE:RRGGBB]"-Markern, oder positionsrekonstruierter PDF-Text). Er kann
Zeilenumbrüche oder Spaltensprünge an ungünstigen Stellen haben.

Regeln, ausnahmslos:
- Nur echte Einheiten. Überschriften, Zwischen-, Summen- und Legendenzeilen,
  Deckblätter, Kontaktangaben, Fußzeilen und Bildnachweise erzeugen NICHTS.
- Stellplätze, Garagen, Gewerbeeinheiten und Hobbyräume bekommen ihren eigenen
  "typ" (stellplatz, garage, gewerbe, sonstiges), niemals "wohnung".
- Stellplatzoptionen, die für alle Einheiten gelten (z. B. "Tiefgaragenstellplatz
  75.000 EUR" ohne Bezug zu einer konkreten Wohnung), sind KEINE Einheiten und
  werden KEINER Wohnung zugeordnet. Sie gehören in die Hinweisliste.
  "garage"/"stellplatz" werden nur dann true, wenn die Quelle einen konkreten
  Platz einer konkreten Einheit zuordnet.
- Steht in der Preisspalte eine Zahl, ist diese Zahl der Kaufpreis — auch wenn
  daneben zusätzlich ein Statuswort wie "reserviert" oder "verkauft" steht. Das
  Statuswort setzt dann NUR den Status, es löscht den Preis nicht.
  Beispiel: "295.225,-EUR reserviert" → "kaufpreis": 295225, "status": "reserviert".
  Nur wenn in der Preisspalte überhaupt KEINE Zahl steht, sondern ausschließlich
  ein Wort, bleibt "kaufpreis" null und das Wort bestimmt den Status.
  Beispiel: "verkauft" (ohne Zahl) → "kaufpreis": null, "status": "verkauft".
  Niemals 0 statt null.
- Zimmerzahl auch aus Fließtext ziehen ("2 ZIMMERWOHNUNG" → "zimmer": "2").
- "groesse" bleibt Text, exakt wie in der Quelle, mit deutschem Komma. Nicht
  runden, nicht umrechnen, keine Einheit anhängen wenn keine in der Quelle steht.
- Farbmarker ([FARBE:RRGGBB]) nur auswerten, wenn im Text erkennbar eine Legende
  vorhanden ist (z. B. "rot = verkauft"). Ohne Legende: die vorkommenden Farben
  in die Hinweise schreiben, nicht raten, was sie bedeuten.
- Summenzeilen der Quelle (falls vorhanden) unverändert in "summenZeile"
  zurückgeben. Selbst nichts addieren. Gibt es keine Summenzeile in der Quelle,
  ist "summenZeile" null.
- Hinweise auf Deutsch und konkret: Widersprüche zwischen Tabellenblättern,
  Stellplatzoptionen ohne Zuordnung, vorkommende Farben ohne Legende,
  Auffälligkeiten wie eine Wohnung mit untypischer Größe für ihre Zimmerzahl.
- Nichts erfinden. Fehlende Angaben bleiben null.

Antworte NUR mit einem JSON-Objekt exakt dieser Form, ohne Markdown-Codeblock,
ohne Fließtext davor oder danach:

{
  "einheiten": [
    {
      "bezeichnung": string,
      "typ": "wohnung" | "stellplatz" | "garage" | "gewerbe" | "sonstiges",
      "etage": string | null,
      "zimmer": string | null,
      "groesse": string | null,
      "kaufpreis": number | null,
      "kaltmiete": number | null,
      "status": "frei" | "reserviert" | "verkauft" | null,
      "garage": boolean,
      "garagePreis": number | null,
      "stellplatz": boolean,
      "stellplatzPreis": number | null,
      "hinweis": string | null
    }
  ],
  "hinweise": string[],
  "summenZeile": { "flaeche": number | null, "kaufpreis": number | null } | null
}`

export async function extrahiere(
  rohtext: string,
  apiKey: string,
): Promise<{ rohantwort: string; ergebnis: ExtraktionsErgebnis }> {
  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model: MODELL,
    max_tokens: 8192,
    // Ein Regel-Umkipper (W01/W05 fälschlich auf kaufpreis: null) trat beim
    // Standard-Sampling auf. temperature: 0 macht Wiederholungen stabiler,
    // ersetzt aber nicht die Pflicht-Prüfansicht vor der Übernahme.
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: rohtext }],
  })

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  if (!textBlock) throw new Error('Modellantwort enthält keinen Textblock.')

  const rohantwort = textBlock.text.trim()
  const bereinigt = rohantwort
    .replace(/^```(?:json)?\n?/, '')
    .replace(/\n?```$/, '')
    .trim()

  let ergebnis: ExtraktionsErgebnis
  try {
    ergebnis = JSON.parse(bereinigt)
  } catch (e) {
    throw new Error(
      `Modellantwort ist kein valides JSON (${e instanceof Error ? e.message : e}). Rohantwort wurde trotzdem gespeichert, sieh sie dir an.`,
    )
  }

  return { rohantwort, ergebnis }
}
