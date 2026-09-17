export type EinheitTyp = 'wohnung' | 'stellplatz' | 'garage' | 'gewerbe' | 'sonstiges'
export type EinheitStatus = 'frei' | 'reserviert' | 'verkauft'

export interface Projekt {
  id: string
  name: string
  ort: string | null
  bautraeger: string | null
  notiz: string | null
  kontrolle_flaeche: number | null
  kontrolle_kaufpreis: number | null
  created_at: string
  updated_at: string
}

export interface Einheit {
  id: string
  projekt_id: string
  bezeichnung: string
  typ: EinheitTyp
  etage: string | null
  zimmer: string | null
  groesse: string | null
  kaufpreis: number | null
  kaltmiete: number | null
  status: EinheitStatus | null
  garage: boolean
  garage_preis: number | null
  stellplatz: boolean
  stellplatz_preis: number | null
  hinweis: string | null
  sortierung: number | null
  created_at: string
  updated_at: string
}

export type ImportStatus = 'wird_geparst' | 'wird_erkannt' | 'fertig' | 'fehler'

// Spiegelt ExtrahierteEinheit/ExtraktionsErgebnis aus src/server/extraktion.ts.
// Bewusst dupliziert statt importiert: der Client darf das dortige Modul nicht
// laden (zieht das Anthropic-SDK in den Client-Bundle), das ist die
// Wire-Format-Grenze zwischen Function und Oberfläche.
export interface ExtrahierteEinheitRoh {
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

export interface ModellAntwort {
  einheiten: ExtrahierteEinheitRoh[]
  summenZeile: { flaeche: number | null; kaufpreis: number | null } | null
}

export interface Import {
  id: string
  projekt_id: string
  dateiname: string
  storage_pfad: string
  quelle_typ: string
  status: ImportStatus
  fehler: string | null
  roh_text: string | null
  modell_antwort: ModellAntwort | null
  hinweise: string[] | null
  erstellt_von: string | null
  created_at: string
}

