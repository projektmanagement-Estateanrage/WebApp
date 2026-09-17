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

export interface Import {
  id: string
  projekt_id: string
  dateiname: string
  storage_pfad: string
  quelle_typ: string
  roh_text: string | null
  modell_antwort: unknown
  hinweise: unknown
  erstellt_von: string | null
  created_at: string
}

