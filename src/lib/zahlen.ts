// Zentrales Zahlenmodul (CLAUDE.md "Zahlenkonventionen"). Diese Regeln tauchen
// später in Export, Import und Berechnungen wieder auf — deshalb genau eine
// Implementierung, nicht drei leicht unterschiedliche.
//
// Geldbeträge werden als ganze Euro gespeichert (kein Cent-Feld in der DB,
// Cent wird beim Eintippen abgeschnitten), nicht als Cent-Integer.

/** 10.665,60 € eingetippt → 10.665 gespeichert. Leeres Feld → null, nicht 0. */
export function parseEuroInput(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const [ganzzahlTeil] = trimmed.split(',')
  const cleaned = ganzzahlTeil.replace(/[^\d-]/g, '')
  if (cleaned === '' || cleaned === '-') return null
  return Math.trunc(Number(cleaned))
}

/** null → leerer String (kein Preis genannt), sonst deutsches Tausenderformat. */
export function formatEuro(betrag: number | null): string {
  if (betrag === null) return ''
  return `${Math.trunc(betrag).toLocaleString('de-DE')} €`
}

/** Abweichung mit explizitem Vorzeichen, z. B. für den Summenabgleich. */
export function formatEuroSigned(differenz: number): string {
  const gerundet = Math.trunc(differenz)
  if (gerundet === 0) return '0 €'
  const vorzeichen = gerundet > 0 ? '+' : ''
  return `${vorzeichen}${formatEuro(gerundet)}`
}

export interface KaufpreisSumme {
  summe: number
  anzahlMitPreis: number
  anzahlGesamt: number
}

/** Einheiten ohne Preis (null) fließen nicht als 0 in die Summe ein. */
export function summeKaufpreise(werte: Array<number | null>): KaufpreisSumme {
  let summe = 0
  let anzahlMitPreis = 0
  for (const w of werte) {
    if (w !== null) {
      summe += w
      anzahlMitPreis += 1
    }
  }
  return { summe, anzahlMitPreis, anzahlGesamt: werte.length }
}

/**
 * Extrahiert die erste Zahl aus einem Größentext ("43,10 qm", "1.038,55 m²")
 * für Summenbildung. Der Text selbst bleibt an anderer Stelle unangetastet —
 * `groesse` wird nie umgeschrieben, nur zum Rechnen geparst.
 */
export function parseGermanDecimal(value: string): number | null {
  const match = value.trim().match(/-?\d{1,3}(?:\.\d{3})*(?:,\d+)?|-?\d+(?:,\d+)?/)
  if (!match) return null
  const numStr = match[0].replace(/\./g, '').replace(',', '.')
  const parsed = Number(numStr)
  return Number.isNaN(parsed) ? null : parsed
}

/**
 * Größe als Hundertstel-Ganzzahl (43,10 m² → 4310). Summieren in dieser Form
 * vermeidet Floating-Point-Drift (0.1 + 0.2 ≠ 0.3), die bei vielen addierten
 * Dezimalwerten sonst sichtbar würde.
 */
export function parseGroesseZuHundertstel(text: string | null | undefined): number | null {
  if (!text) return null
  const zahl = parseGermanDecimal(text)
  if (zahl === null) return null
  return Math.round(zahl * 100)
}

export function summeHundertstel(werte: Array<number | null>): number {
  return werte.reduce((summe: number, w) => summe + (w ?? 0), 0)
}

export function formatFlaeche(hundertstel: number): string {
  return (hundertstel / 100).toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatFlaecheSigned(differenzHundertstel: number): string {
  if (differenzHundertstel === 0) return '0 m²'
  const vorzeichen = differenzHundertstel > 0 ? '+' : ''
  return `${vorzeichen}${formatFlaeche(differenzHundertstel)} m²`
}

export type AbgleichStatus = 'kein_soll' | 'uebereinstimmung' | 'abweichung'

export interface AbgleichErgebnis {
  status: AbgleichStatus
  differenz: number
}

/**
 * Vergleicht einen berechneten Ist-Wert mit dem Soll-Wert aus der
 * Summenzeile der Quelle, innerhalb einer Toleranz (0,05 m² bzw. 1 €, je nach
 * Aufrufer skaliert — siehe Spezifikation).
 */
export function vergleicheMitToleranz(
  ist: number,
  soll: number | null,
  toleranz: number,
): AbgleichErgebnis {
  if (soll === null) return { status: 'kein_soll', differenz: 0 }
  const differenz = ist - soll
  if (Math.abs(differenz) <= toleranz) return { status: 'uebereinstimmung', differenz }
  return { status: 'abweichung', differenz }
}
