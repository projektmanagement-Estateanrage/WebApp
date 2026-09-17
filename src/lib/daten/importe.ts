import { supabase } from '../supabase'
import type { Import } from '../../types/database'

const AKZEPTIERTE_ENDUNGEN = ['pdf', 'xlsx', 'xlsm', 'xls'] as const

function dateiEndung(dateiname: string): string {
  return dateiname.split('.').pop()?.toLowerCase() ?? ''
}

export function istUnterstuetzteDatei(dateiname: string): boolean {
  return AKZEPTIERTE_ENDUNGEN.includes(dateiEndung(dateiname) as (typeof AKZEPTIERTE_ENDUNGEN)[number])
}

/**
 * Lädt die Datei direkt aus dem Browser in den Storage hoch (die Datei geht
 * nie durch den Function-Request, siehe CLAUDE.md/MCP-Grenzen-Abschnitt),
 * legt die importe-Zeile an und stößt die Background Function an. Gibt die
 * importe-ID zurück, über die die Oberfläche den Fortschritt abfragt.
 */
export async function starteImport(projektId: string, datei: File): Promise<string> {
  if (!istUnterstuetzteDatei(datei.name)) {
    throw new Error(
      `Dateityp ".${dateiEndung(datei.name)}" wird nicht unterstützt. Erlaubt: ${AKZEPTIERTE_ENDUNGEN.join(', ')}.`,
    )
  }

  const storagePfad = `${projektId}/${crypto.randomUUID()}-${datei.name}`
  const { error: uploadError } = await supabase.storage.from('importe').upload(storagePfad, datei)
  if (uploadError) throw uploadError

  const { data, error: insertError } = await supabase
    .from('importe')
    .insert({
      projekt_id: projektId,
      dateiname: datei.name,
      storage_pfad: storagePfad,
      quelle_typ: dateiEndung(datei.name),
    })
    .select('id')
    .single()
  if (insertError) throw insertError

  const importeId = data.id as string

  const res = await fetch('/api/importieren', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ importeId }),
  })
  if (!res.ok && res.status !== 202) {
    throw new Error(`Import konnte nicht gestartet werden (Status ${res.status}).`)
  }

  return importeId
}

export async function ladeImport(importeId: string): Promise<Import> {
  const { data, error } = await supabase.from('importe').select('*').eq('id', importeId).single()
  if (error) throw error
  return data as Import
}
