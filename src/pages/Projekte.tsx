import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { ladeProjektUebersicht, loescheProjekt, type ProjektUebersichtZeile } from '../lib/daten/projekte'

function formatDatum(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function Projekte() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [projekte, setProjekte] = useState<ProjektUebersichtZeile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [loeschKandidat, setLoeschKandidat] = useState<ProjektUebersichtZeile | null>(null)

  async function laden() {
    setLoading(true)
    try {
      setProjekte(await ladeProjektUebersicht())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    laden()
  }, [])

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    if (!name) return

    const { error } = await supabase.from('projekte').insert({
      name,
      ort: (form.get('ort') as string) || null,
      bautraeger: (form.get('bautraeger') as string) || null,
      notiz: (form.get('notiz') as string) || null,
    })
    if (error) {
      setError(error.message)
      return
    }
    setShowForm(false)
    laden()
  }

  async function handleLoeschen() {
    if (!loeschKandidat) return
    try {
      await loescheProjekt(loeschKandidat.id)
      setLoeschKandidat(null)
      laden()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Projekte</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white"
          >
            {showForm ? 'Abbrechen' : 'Neues Projekt'}
          </button>
          <button
            onClick={signOut}
            className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700"
          >
            Abmelden
          </button>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-6 space-y-3 rounded-lg border border-slate-200 bg-white p-4"
        >
          <div>
            <label className="text-sm font-medium text-slate-700">Name *</label>
            <input
              name="name"
              required
              autoFocus
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Ort</label>
            <input
              name="ort"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Bauträger</label>
            <input
              name="bautraeger"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Notiz</label>
            <textarea
              name="notiz"
              rows={2}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white"
          >
            Anlegen
          </button>
        </form>
      )}

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-500">Lädt…</p>
      ) : projekte.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-center">
          <p className="mb-4 text-sm text-slate-500">
            Hier entstehen aus hochgeladenen Kaufpreislisten geprüfte Einheitenlisten für eure
            Projekte. Noch ist keins angelegt.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white"
          >
            Neues Projekt
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2">Projekt</th>
                <th className="px-3 py-2">Ort</th>
                <th className="px-3 py-2">Bauträger</th>
                <th className="px-3 py-2 text-right">Einheiten</th>
                <th className="px-3 py-2 text-right">Frei</th>
                <th className="px-3 py-2 text-right">Reserviert</th>
                <th className="px-3 py-2 text-right">Verkauft</th>
                <th className="px-3 py-2">Zuletzt geändert</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {projekte.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/projekte/${p.id}`)}
                  className="cursor-pointer hover:bg-slate-50"
                >
                  <td className="px-3 py-2 font-medium text-slate-900">{p.name}</td>
                  <td className="px-3 py-2 text-slate-600">{p.ort ?? '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{p.bautraeger ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.anzahlEinheiten}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.frei}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.reserviert}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.verkauft}</td>
                  <td className="px-3 py-2 text-slate-500">{formatDatum(p.updatedAt)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setLoeschKandidat(p)
                      }}
                      className="text-slate-400 hover:text-red-600"
                      aria-label={`${p.name} löschen`}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {loeschKandidat && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow-lg">
            <h2 className="font-semibold text-slate-900">Projekt löschen?</h2>
            <p className="text-sm text-slate-600">
              „{loeschKandidat.name}" wird gelöscht, zusammen mit{' '}
              <strong>{loeschKandidat.anzahlEinheiten}</strong>{' '}
              {loeschKandidat.anzahlEinheiten === 1 ? 'Einheit' : 'Einheiten'}. Das lässt sich
              nicht rückgängig machen.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setLoeschKandidat(null)}
                className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700"
              >
                Abbrechen
              </button>
              <button
                onClick={handleLoeschen}
                className="rounded bg-red-600 px-3 py-2 text-sm font-medium text-white"
              >
                Endgültig löschen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
