// Zahlenkonventionen aus CLAUDE.md: nie runden, Cent wird abgeschnitten.

export function formatEuro(betragCent: number | null): string {
  if (betragCent === null) return ''
  return `${betragCent.toLocaleString('de-DE')} €`
}

export function parseEuroInput(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  // Deutsches Format: "." als Tausendertrenner, "," als Dezimaltrenner.
  // Cent wird abgeschnitten, nicht gerundet.
  const [ganzzahlTeil] = trimmed.split(',')
  const cleaned = ganzzahlTeil.replace(/[^\d]/g, '')
  if (cleaned === '') return null
  return Math.trunc(Number(cleaned))
}
