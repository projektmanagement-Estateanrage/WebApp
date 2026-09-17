import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatEuro, parseEuroInput } from '../lib/format'
import type { Einheit, EinheitStatus, EinheitTyp, Projekt } from '../types/database'

const TYPEN: EinheitTyp[] = ['wohnung', 'stellplatz', 'garage', 'gewerbe', 'sonstiges']
const STATUS: EinheitStatus[] = ['frei', 'reserviert', 'verkauft']

export function ProjektDetail() {
  const { id } = useParams<{ id: string }>()
  const [projekt, setProjekt] = useState<Projekt | null>(null)
  const [einheiten, setEinheiten] = useState<Einheit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function laden() {
    if (!id) return
    setLoading(true)
    const [{ data: p, error: pErr }, { data: e, error: eErr }] = await Promise.all([
      supabase.from('projekte').select('*').eq('id', id).single(),
      supabase.from('einheiten').select('*').eq('projekt_id', id).order('sortierung'),
    ])
    if (pErr) setError(pErr.message)
    else setProjekt(p as Projekt)
    if (eErr) setError(eErr.message)
    else setEinheiten((e ?? []) as Einheit[])
    setLoading(false)
  }

  useEffect(() => {
    laden()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function updateFeld<K extends keyof Einheit>(row: Einheit, feld: K, wert: Einheit[K]) {
    setEinheiten((prev) => prev.map((r) => (r.id === row.id ? { ...r, [feld]: wert } : r)))
    const { error } = await supabase
      .from('einheiten')
      .update({ [feld]: wert } as Partial<Einheit>)
      .eq('id', row.id)
    if (error) setError(error.message)
  }

  async function neueZeile() {
    if (!id) return
    const { data, error } = await supabase
      .from('einheiten')
      .insert({
        projekt_id: id,
        bezeichnung: 'Neue Einheit',
        typ: 'wohnung',
        sortierung: einheiten.length,
      })
      .select()
      .single()
    if (error) {
      setError(error.message)
      return
    }
    setEinheiten((prev) => [...prev, data as Einheit])
  }

  async function zeileLoeschen(rowId: string) {
    const { error } = await supabase.from('einheiten').delete().eq('id', rowId)
    if (error) {
      setError(error.message)
      return
    }
    setEinheiten((prev) => prev.filter((r) => r.id !== rowId))
  }

  if (loading) return <p className="p-8 text-sm text-slate-500">Lädt…</p>
  if (!projekt) return <p className="p-8 text-sm text-red-600">Projekt nicht gefunden.</p>

  const kaufpreisSumme = einheiten.reduce((sum, e) => sum + (e.kaufpreis ?? 0), 0)

  return (
    <div className="mx-auto max-w-6xl p-8">
      <Link to="/projekte" className="text-sm text-slate-500 hover:underline">
        ← Projekte
      </Link>
      <h1 className="mt-2 mb-1 text-xl font-semibold text-slate-900">{projekt.name}</h1>
      <p className="mb-6 text-sm text-slate-500">
        {[projekt.ort, projekt.bautraeger].filter(Boolean).join(' · ') || 'Keine weiteren Angaben'}
      </p>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-600">
          {einheiten.length} Einheiten · Kaufpreissumme {formatEuro(kaufpreisSumme)}
          {projekt.kontrolle_kaufpreis !== null && (
            <span className="ml-2 text-slate-400">
              (Quelle: {formatEuro(projekt.kontrolle_kaufpreis)})
            </span>
          )}
        </div>
        <button
          onClick={neueZeile}
          className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
        >
          + Zeile
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-3 py-2">Bezeichnung</th>
              <th className="px-3 py-2">Typ</th>
              <th className="px-3 py-2">Etage</th>
              <th className="px-3 py-2">Zimmer</th>
              <th className="px-3 py-2">Größe</th>
              <th className="px-3 py-2">Kaufpreis</th>
              <th className="px-3 py-2">Kaltmiete</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Hinweis</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {einheiten.map((row) => (
              <tr key={row.id}>
                <td className="px-1 py-1">
                  <input
                    className="w-28 rounded border border-transparent px-2 py-1 hover:border-slate-200 focus:border-slate-400"
                    defaultValue={row.bezeichnung}
                    onBlur={(e) => updateFeld(row, 'bezeichnung', e.target.value)}
                  />
                </td>
                <td className="px-1 py-1">
                  <select
                    className="rounded border border-transparent px-2 py-1 hover:border-slate-200 focus:border-slate-400"
                    value={row.typ}
                    onChange={(e) => updateFeld(row, 'typ', e.target.value as EinheitTyp)}
                  >
                    {TYPEN.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-1 py-1">
                  <input
                    className="w-16 rounded border border-transparent px-2 py-1 hover:border-slate-200 focus:border-slate-400"
                    defaultValue={row.etage ?? ''}
                    onBlur={(e) => updateFeld(row, 'etage', e.target.value || null)}
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    className="w-14 rounded border border-transparent px-2 py-1 hover:border-slate-200 focus:border-slate-400"
                    defaultValue={row.zimmer ?? ''}
                    onBlur={(e) => updateFeld(row, 'zimmer', e.target.value || null)}
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    className="w-20 rounded border border-transparent px-2 py-1 hover:border-slate-200 focus:border-slate-400"
                    defaultValue={row.groesse ?? ''}
                    onBlur={(e) => updateFeld(row, 'groesse', e.target.value || null)}
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    className="w-24 rounded border border-transparent px-2 py-1 hover:border-slate-200 focus:border-slate-400"
                    defaultValue={row.kaufpreis === null ? '' : String(row.kaufpreis)}
                    placeholder="verkauft?"
                    onBlur={(e) => updateFeld(row, 'kaufpreis', parseEuroInput(e.target.value))}
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    className="w-20 rounded border border-transparent px-2 py-1 hover:border-slate-200 focus:border-slate-400"
                    defaultValue={row.kaltmiete === null ? '' : String(row.kaltmiete)}
                    onBlur={(e) => updateFeld(row, 'kaltmiete', parseEuroInput(e.target.value))}
                  />
                </td>
                <td className="px-1 py-1">
                  <select
                    className="rounded border border-transparent px-2 py-1 hover:border-slate-200 focus:border-slate-400"
                    value={row.status ?? ''}
                    onChange={(e) =>
                      updateFeld(row, 'status', (e.target.value || null) as EinheitStatus | null)
                    }
                  >
                    <option value="">—</option>
                    {STATUS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-1 py-1">
                  <input
                    className="w-40 rounded border border-transparent px-2 py-1 hover:border-slate-200 focus:border-slate-400"
                    defaultValue={row.hinweis ?? ''}
                    onBlur={(e) => updateFeld(row, 'hinweis', e.target.value || null)}
                  />
                </td>
                <td className="px-1 py-1">
                  <button
                    onClick={() => zeileLoeschen(row.id)}
                    className="text-slate-400 hover:text-red-600"
                    aria-label="Zeile löschen"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {einheiten.length === 0 && (
          <p className="p-4 text-sm text-slate-500">
            Noch keine Einheiten. Über „+ Zeile" manuell anlegen oder (ab Phase 2) eine Liste
            hochladen.
          </p>
        )}
      </div>
    </div>
  )
}
