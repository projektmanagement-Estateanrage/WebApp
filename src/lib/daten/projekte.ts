import { supabase } from '../supabase'
import type { EinheitStatus } from '../../types/database'

export interface ProjektUebersichtZeile {
  id: string
  name: string
  ort: string | null
  bautraeger: string | null
  updatedAt: string
  anzahlEinheiten: number
  frei: number
  reserviert: number
  verkauft: number
}

interface RohZeile {
  id: string
  name: string
  ort: string | null
  bautraeger: string | null
  updated_at: string
  einheiten: { status: EinheitStatus | null }[] | null
}

/**
 * Eine Query für die gesamte Projektübersicht samt Status-Zählungen —
 * bewusst hinter dieser einen Funktion gekapselt. PostgREST kann in der
 * verschachtelten Auswahl nicht nach Status gruppieren, die Zählung passiert
 * also im Client; deshalb wird auch nur `einheiten(status)` geladen, nicht
 * `einheiten(*)`. Sollte das bei wachsender Projektzahl spürbar langsam
 * werden, ist der Wechsel auf eine View (mit `security_invoker = true`!) ein
 * Eingriff in diese eine Datei statt in jede Komponente.
 */
export async function ladeProjektUebersicht(): Promise<ProjektUebersichtZeile[]> {
  const { data, error } = await supabase
    .from('projekte')
    .select('id, name, ort, bautraeger, updated_at, einheiten(status)')
    .order('updated_at', { ascending: false })

  if (error) throw error

  return ((data ?? []) as unknown as RohZeile[]).map((row) => {
    let frei = 0
    let reserviert = 0
    let verkauft = 0
    const einheiten = row.einheiten ?? []
    for (const e of einheiten) {
      if (e.status === 'frei') frei += 1
      else if (e.status === 'reserviert') reserviert += 1
      else if (e.status === 'verkauft') verkauft += 1
    }
    return {
      id: row.id,
      name: row.name,
      ort: row.ort,
      bautraeger: row.bautraeger,
      updatedAt: row.updated_at,
      anzahlEinheiten: einheiten.length,
      frei,
      reserviert,
      verkauft,
    }
  })
}

export async function loescheProjekt(id: string): Promise<void> {
  const { error } = await supabase.from('projekte').delete().eq('id', id)
  if (error) throw error
}
