import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  formatEuro,
  formatEuroSigned,
  formatFlaeche,
  formatFlaecheSigned,
  parseEuroInput,
  parseGroesseZuHundertstel,
  summeHundertstel,
  summeKaufpreise,
  vergleicheMitToleranz,
} from '../lib/zahlen'
import type { Einheit, EinheitStatus, EinheitTyp, Projekt } from '../types/database'

const TYPEN: EinheitTyp[] = ['wohnung', 'stellplatz', 'garage', 'gewerbe', 'sonstiges']
const STATUS: EinheitStatus[] = ['frei', 'reserviert', 'verkauft']
const TOLERANZ_FLAECHE_HUNDERTSTEL = 5 // 0,05 m²
const TOLERANZ_KAUFPREIS = 1 // 1 €
const DEBOUNCE_MS = 600

type SortSpalte = keyof Pick<
  Einheit,
  | 'bezeichnung'
  | 'typ'
  | 'etage'
  | 'zimmer'
  | 'groesse'
  | 'kaufpreis'
  | 'kaltmiete'
  | 'status'
  | 'sortierung'
>

function vergleicheGeneric(a: unknown, b: unknown): number {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : -1
  if (b === null || b === undefined) return 1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return a === b ? 0 : a ? 1 : -1
  return String(a).localeCompare(String(b), 'de')
}

function parseZahlAusText(text: string | null): number {
  if (!text) return -Infinity
  const n = parseGroesseZuHundertstel(text)
  return n ?? -Infinity
}

// Geld-/Zahlenzelle: zeigt formatiert an, solange sie nicht fokussiert ist,
// und den Rohwert während der Eingabe — sonst kollidieren Tausenderpunkt und
// Cursor-Position beim Tippen.
function ZahlZelle({
  wert,
  onCommit,
  onKeyDown,
  cellRef,
  breiteKlasse = 'w-24',
  placeholder,
}: {
  wert: number | null
  onCommit: (n: number | null) => void
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void
  cellRef: (el: HTMLInputElement | null) => void
  breiteKlasse?: string
  placeholder?: string
}) {
  const [fokus, setFokus] = useState(false)
  const [text, setText] = useState(wert === null ? '' : String(wert))

  useEffect(() => {
    if (!fokus) setText(wert === null ? '' : String(wert))
  }, [wert, fokus])

  return (
    <input
      ref={cellRef}
      className={`${breiteKlasse} rounded border border-transparent px-2 py-1 text-right tabular-nums hover:border-slate-200 focus:border-slate-400`}
      value={fokus ? text : wert === null ? '' : wert.toLocaleString('de-DE')}
      placeholder={placeholder}
      onFocus={() => setFokus(true)}
      onBlur={() => setFokus(false)}
      onChange={(e: ChangeEvent<HTMLInputElement>) => {
        setText(e.target.value)
        onCommit(parseEuroInput(e.target.value))
      }}
      onKeyDown={onKeyDown}
    />
  )
}

export function ProjektDetail() {
  const { id } = useParams<{ id: string }>()
  const [projekt, setProjekt] = useState<Projekt | null>(null)
  const [einheiten, setEinheiten] = useState<Einheit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [speicherFehler, setSpeicherFehler] = useState<string | null>(null)
  const [zuletztGespeichert, setZuletztGespeichert] = useState<Date | null>(null)
  const [selectedTyp, setSelectedTyp] = useState<EinheitTyp | 'alle'>('alle')
  const [sortSpalte, setSortSpalte] = useState<SortSpalte>('sortierung')
  const [sortRichtung, setSortRichtung] = useState<'asc' | 'desc'>('asc')

  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const bestaetigteEinheiten = useRef<Map<string, Einheit>>(new Map())
  const bestaetigtesProjekt = useRef<Projekt | null>(null)
  const zellRefs = useRef<Map<string, HTMLInputElement>>(new Map())

  async function laden() {
    if (!id) return
    setLoading(true)
    const [{ data: p, error: pErr }, { data: e, error: eErr }] = await Promise.all([
      supabase.from('projekte').select('*').eq('id', id).single(),
      supabase.from('einheiten').select('*').eq('projekt_id', id).order('sortierung'),
    ])
    if (pErr) setError(pErr.message)
    else {
      setProjekt(p as Projekt)
      bestaetigtesProjekt.current = p as Projekt
    }
    if (eErr) setError(eErr.message)
    else {
      const rows = (e ?? []) as Einheit[]
      setEinheiten(rows)
      bestaetigteEinheiten.current = new Map(rows.map((r) => [r.id, r]))
    }
    setLoading(false)
  }

  useEffect(() => {
    laden()
    // Kein Realtime in dieser Phase — beim Zurückkehren auf den Tab reicht
    // ein Neuladen, damit man nicht auf veralteten Werten weiterarbeitet.
    function onVisibility() {
      if (document.visibilityState === 'visible') laden()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  function debounced(key: string, fn: () => void) {
    const bestehender = timers.current.get(key)
    if (bestehender) clearTimeout(bestehender)
    timers.current.set(
      key,
      setTimeout(() => {
        timers.current.delete(key)
        fn()
      }, DEBOUNCE_MS),
    )
  }

  function einheitFeldAendern<K extends keyof Einheit>(
    row: Einheit,
    feld: K,
    wert: Einheit[K],
    sofort = false,
  ) {
    setEinheiten((prev) => prev.map((r) => (r.id === row.id ? { ...r, [feld]: wert } : r)))
    const key = `einheit:${row.id}:${String(feld)}`

    const speichern = async () => {
      const { error } = await supabase
        .from('einheiten')
        .update({ [feld]: wert } as Partial<Einheit>)
        .eq('id', row.id)
      if (error) {
        const letzterStand = bestaetigteEinheiten.current.get(row.id)
        setEinheiten((prev) =>
          prev.map((r) =>
            r.id === row.id ? { ...r, [feld]: letzterStand ? letzterStand[feld] : r[feld] } : r,
          ),
        )
        setSpeicherFehler(`„${row.bezeichnung || 'Zeile'}" konnte nicht gespeichert werden: ${error.message}`)
      } else {
        const bisher = bestaetigteEinheiten.current.get(row.id) ?? row
        bestaetigteEinheiten.current.set(row.id, { ...bisher, [feld]: wert })
        setSpeicherFehler(null)
        setZuletztGespeichert(new Date())
      }
    }

    if (sofort) speichern()
    else debounced(key, speichern)
  }

  function projektFeldAendern<K extends keyof Projekt>(feld: K, wert: Projekt[K]) {
    if (!projekt) return
    setProjekt((prev) => (prev ? { ...prev, [feld]: wert } : prev))
    const key = `projekt:${String(feld)}`
    debounced(key, async () => {
      const { error } = await supabase
        .from('projekte')
        .update({ [feld]: wert } as Partial<Projekt>)
        .eq('id', projekt.id)
      if (error) {
        const letzterStand = bestaetigtesProjekt.current
        setProjekt((prev) => (prev ? { ...prev, [feld]: letzterStand ? letzterStand[feld] : prev[feld] } : prev))
        setSpeicherFehler(`Kontrollwert konnte nicht gespeichert werden: ${error.message}`)
      } else {
        bestaetigtesProjekt.current = bestaetigtesProjekt.current
          ? { ...bestaetigtesProjekt.current, [feld]: wert }
          : null
        setSpeicherFehler(null)
        setZuletztGespeichert(new Date())
      }
    })
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
    const neu = data as Einheit
    setEinheiten((prev) => [...prev, neu])
    bestaetigteEinheiten.current.set(neu.id, neu)
  }

  async function zeileLoeschen(rowId: string) {
    const { error } = await supabase.from('einheiten').delete().eq('id', rowId)
    if (error) {
      setError(error.message)
      return
    }
    setEinheiten((prev) => prev.filter((r) => r.id !== rowId))
    bestaetigteEinheiten.current.delete(rowId)
  }

  const typenMitAnzahl = useMemo(() => {
    const zaehler = new Map<EinheitTyp, number>()
    for (const e of einheiten) zaehler.set(e.typ, (zaehler.get(e.typ) ?? 0) + 1)
    return TYPEN.filter((t) => (zaehler.get(t) ?? 0) > 0).map((t) => ({ typ: t, anzahl: zaehler.get(t)! }))
  }, [einheiten])

  const sichtbareZeilen = useMemo(() => {
    let zeilen = einheiten
    if (selectedTyp !== 'alle') zeilen = zeilen.filter((e) => e.typ === selectedTyp)

    const richtung = sortRichtung === 'asc' ? 1 : -1
    const numerischeTextspalten: SortSpalte[] = ['groesse', 'zimmer']

    return [...zeilen].sort((a, b) => {
      if (numerischeTextspalten.includes(sortSpalte)) {
        return richtung * (parseZahlAusText(a[sortSpalte] as string | null) - parseZahlAusText(b[sortSpalte] as string | null))
      }
      return richtung * vergleicheGeneric(a[sortSpalte], b[sortSpalte])
    })
  }, [einheiten, selectedTyp, sortSpalte, sortRichtung])

  function spalteSortieren(spalte: SortSpalte) {
    if (spalte === sortSpalte) setSortRichtung((r) => (r === 'asc' ? 'desc' : 'asc'))
    else {
      setSortSpalte(spalte)
      setSortRichtung('asc')
    }
  }

  function sortPfeil(spalte: SortSpalte) {
    if (spalte !== sortSpalte) return ''
    return sortRichtung === 'asc' ? ' ▲' : ' ▼'
  }

  function registriereZelle(rowId: string, feld: string) {
    return (el: HTMLInputElement | null) => {
      const key = `${rowId}:${feld}`
      if (el) zellRefs.current.set(key, el)
      else zellRefs.current.delete(key)
    }
  }

  function macheEnterHandler(rowIndex: number, feld: string) {
    return (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Enter') return
      e.preventDefault()
      const naechste = sichtbareZeilen[rowIndex + 1]
      if (!naechste) return
      zellRefs.current.get(`${naechste.id}:${feld}`)?.focus()
    }
  }

  if (loading) return <p className="p-8 text-sm text-slate-500">Lädt…</p>
  if (!projekt) return <p className="p-8 text-sm text-red-600">Projekt nicht gefunden.</p>

  const statusZaehlung = { frei: 0, reserviert: 0, verkauft: 0 }
  for (const e of einheiten) {
    if (e.status) statusZaehlung[e.status] += 1
  }

  const flaecheSummeHundertstel = summeHundertstel(
    einheiten.filter((e) => e.typ === 'wohnung').map((e) => parseGroesseZuHundertstel(e.groesse)),
  )
  const kaufpreisSumme = summeKaufpreise(einheiten.map((e) => e.kaufpreis))

  const flaecheAbgleich =
    projekt.kontrolle_flaeche !== null
      ? vergleicheMitToleranz(
          flaecheSummeHundertstel,
          Math.round(projekt.kontrolle_flaeche * 100),
          TOLERANZ_FLAECHE_HUNDERTSTEL,
        )
      : null
  const kaufpreisAbgleich =
    projekt.kontrolle_kaufpreis !== null
      ? vergleicheMitToleranz(
          kaufpreisSumme.summe,
          Math.trunc(projekt.kontrolle_kaufpreis),
          TOLERANZ_KAUFPREIS,
        )
      : null

  return (
    <div className="mx-auto max-w-6xl p-8">
      <Link to="/projekte" className="text-sm text-slate-500 hover:underline">
        ← Projekte
      </Link>
      <h1 className="mt-2 mb-1 text-xl font-semibold text-slate-900">{projekt.name}</h1>
      <p className="mb-6 text-sm text-slate-500">{projekt.ort ?? 'Kein Ort hinterlegt'}</p>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {speicherFehler && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {speicherFehler}
        </div>
      )}

      {/* Kennzahlen + Abgleich — wichtigste Anzeige der Seite */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Einheiten</p>
          <p className="text-2xl font-semibold text-slate-900 tabular-nums">{einheiten.length}</p>
          <p className="text-xs text-slate-500">
            {statusZaehlung.frei} frei · {statusZaehlung.reserviert} reserviert ·{' '}
            {statusZaehlung.verkauft} verkauft
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
            Wohnfläche (nur Wohnungen)
          </p>
          <p className="text-2xl font-semibold text-slate-900 tabular-nums">
            {formatFlaeche(flaecheSummeHundertstel)} m²
          </p>
          <label className="mt-2 block text-xs text-slate-500">
            Kontrollwert aus Quelle (m²)
            <input
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm tabular-nums"
              defaultValue={projekt.kontrolle_flaeche ?? ''}
              placeholder="z. B. 1038,55"
              onChange={(e) => {
                const roh = e.target.value.trim().replace(',', '.')
                projektFeldAendern('kontrolle_flaeche', roh === '' ? null : Number(roh))
              }}
            />
          </label>
          {flaecheAbgleich && (
            <p
              className={`mt-1 text-sm font-medium ${
                flaecheAbgleich.status === 'uebereinstimmung' ? 'text-green-700' : 'text-amber-700'
              }`}
            >
              {flaecheAbgleich.status === 'uebereinstimmung'
                ? '✓ stimmt mit Quelle überein'
                : `Abweichung: ${formatFlaecheSigned(flaecheAbgleich.differenz)}`}
            </p>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Kaufpreissumme</p>
          <p className="text-2xl font-semibold text-slate-900 tabular-nums">
            {formatEuro(kaufpreisSumme.summe)}
          </p>
          {kaufpreisSumme.anzahlMitPreis < kaufpreisSumme.anzahlGesamt && (
            <p className="text-xs text-slate-500">
              über {kaufpreisSumme.anzahlMitPreis} von {kaufpreisSumme.anzahlGesamt} Einheiten
            </p>
          )}
          <label className="mt-2 block text-xs text-slate-500">
            Kontrollwert aus Quelle (€)
            <input
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm tabular-nums"
              defaultValue={projekt.kontrolle_kaufpreis ?? ''}
              placeholder="z. B. 5625500"
              onChange={(e) => projektFeldAendern('kontrolle_kaufpreis', parseEuroInput(e.target.value))}
            />
          </label>
          {kaufpreisAbgleich && (
            <p
              className={`mt-1 text-sm font-medium ${
                kaufpreisAbgleich.status === 'uebereinstimmung' ? 'text-green-700' : 'text-amber-700'
              }`}
            >
              {kaufpreisAbgleich.status === 'uebereinstimmung'
                ? '✓ stimmt mit Quelle überein'
                : `Abweichung: ${formatEuroSigned(kaufpreisAbgleich.differenz)}`}
            </p>
          )}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedTyp('alle')}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              selectedTyp === 'alle'
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300 text-slate-600'
            }`}
          >
            Alle ({einheiten.length})
          </button>
          {typenMitAnzahl.map(({ typ, anzahl }) => (
            <button
              key={typ}
              onClick={() => setSelectedTyp(typ)}
              className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${
                selectedTyp === typ
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 text-slate-600'
              }`}
            >
              {typ} ({anzahl})
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {zuletztGespeichert && (
            <span className="text-xs text-slate-400">
              Zuletzt gespeichert um{' '}
              {zuletztGespeichert.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button
            onClick={neueZeile}
            className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            + Zeile
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
            <tr>
              {(
                [
                  ['bezeichnung', 'Bezeichnung'],
                  ['typ', 'Typ'],
                  ['etage', 'Etage'],
                  ['zimmer', 'Zimmer'],
                  ['groesse', 'Größe'],
                  ['kaufpreis', 'Kaufpreis'],
                  ['kaltmiete', 'Kaltmiete'],
                  ['status', 'Status'],
                ] as [SortSpalte, string][]
              ).map(([spalte, label]) => (
                <th
                  key={spalte}
                  onClick={() => spalteSortieren(spalte)}
                  className="cursor-pointer px-3 py-2 select-none"
                >
                  {label}
                  {sortPfeil(spalte)}
                </th>
              ))}
              <th className="px-3 py-2">Garage</th>
              <th className="px-3 py-2">Garage-Preis</th>
              <th className="px-3 py-2">Stellplatz</th>
              <th className="px-3 py-2">Stellplatz-Preis</th>
              <th className="px-3 py-2">Hinweis</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sichtbareZeilen.map((row, rowIndex) => (
              <tr key={row.id}>
                <td className="px-1 py-1">
                  <input
                    ref={registriereZelle(row.id, 'bezeichnung')}
                    className="w-28 rounded border border-transparent px-2 py-1 hover:border-slate-200 focus:border-slate-400"
                    value={row.bezeichnung}
                    onChange={(e) => einheitFeldAendern(row, 'bezeichnung', e.target.value)}
                    onKeyDown={macheEnterHandler(rowIndex, 'bezeichnung')}
                  />
                </td>
                <td className="px-1 py-1">
                  <select
                    className="rounded border border-transparent px-2 py-1 hover:border-slate-200 focus:border-slate-400"
                    value={row.typ}
                    onChange={(e) => einheitFeldAendern(row, 'typ', e.target.value as EinheitTyp, true)}
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
                    ref={registriereZelle(row.id, 'etage')}
                    className="w-16 rounded border border-transparent px-2 py-1 hover:border-slate-200 focus:border-slate-400"
                    value={row.etage ?? ''}
                    onChange={(e) => einheitFeldAendern(row, 'etage', e.target.value || null)}
                    onKeyDown={macheEnterHandler(rowIndex, 'etage')}
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    ref={registriereZelle(row.id, 'zimmer')}
                    className="w-14 rounded border border-transparent px-2 py-1 hover:border-slate-200 focus:border-slate-400"
                    value={row.zimmer ?? ''}
                    onChange={(e) => einheitFeldAendern(row, 'zimmer', e.target.value || null)}
                    onKeyDown={macheEnterHandler(rowIndex, 'zimmer')}
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    ref={registriereZelle(row.id, 'groesse')}
                    className="w-20 rounded border border-transparent px-2 py-1 tabular-nums hover:border-slate-200 focus:border-slate-400"
                    value={row.groesse ?? ''}
                    onChange={(e) => einheitFeldAendern(row, 'groesse', e.target.value || null)}
                    onKeyDown={macheEnterHandler(rowIndex, 'groesse')}
                  />
                </td>
                <td className="px-1 py-1">
                  <ZahlZelle
                    wert={row.kaufpreis}
                    placeholder="verkauft?"
                    onCommit={(n) => einheitFeldAendern(row, 'kaufpreis', n)}
                    onKeyDown={macheEnterHandler(rowIndex, 'kaufpreis')}
                    cellRef={registriereZelle(row.id, 'kaufpreis')}
                  />
                </td>
                <td className="px-1 py-1">
                  <ZahlZelle
                    wert={row.kaltmiete}
                    onCommit={(n) => einheitFeldAendern(row, 'kaltmiete', n)}
                    onKeyDown={macheEnterHandler(rowIndex, 'kaltmiete')}
                    cellRef={registriereZelle(row.id, 'kaltmiete')}
                    breiteKlasse="w-20"
                  />
                </td>
                <td className="px-1 py-1">
                  <select
                    className="rounded border border-transparent px-2 py-1 hover:border-slate-200 focus:border-slate-400"
                    value={row.status ?? ''}
                    onChange={(e) =>
                      einheitFeldAendern(row, 'status', (e.target.value || null) as EinheitStatus | null, true)
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
                  <select
                    className="rounded border border-transparent px-2 py-1 hover:border-slate-200 focus:border-slate-400"
                    value={row.garage ? 'ja' : 'nein'}
                    onChange={(e) => einheitFeldAendern(row, 'garage', e.target.value === 'ja', true)}
                  >
                    <option value="nein">Nein</option>
                    <option value="ja">Ja</option>
                  </select>
                </td>
                <td className="px-1 py-1">
                  <ZahlZelle
                    wert={row.garage_preis}
                    onCommit={(n) => einheitFeldAendern(row, 'garage_preis', n)}
                    onKeyDown={macheEnterHandler(rowIndex, 'garage_preis')}
                    cellRef={registriereZelle(row.id, 'garage_preis')}
                    breiteKlasse="w-20"
                  />
                </td>
                <td className="px-1 py-1">
                  <select
                    className="rounded border border-transparent px-2 py-1 hover:border-slate-200 focus:border-slate-400"
                    value={row.stellplatz ? 'ja' : 'nein'}
                    onChange={(e) => einheitFeldAendern(row, 'stellplatz', e.target.value === 'ja', true)}
                  >
                    <option value="nein">Nein</option>
                    <option value="ja">Ja</option>
                  </select>
                </td>
                <td className="px-1 py-1">
                  <ZahlZelle
                    wert={row.stellplatz_preis}
                    onCommit={(n) => einheitFeldAendern(row, 'stellplatz_preis', n)}
                    onKeyDown={macheEnterHandler(rowIndex, 'stellplatz_preis')}
                    cellRef={registriereZelle(row.id, 'stellplatz_preis')}
                    breiteKlasse="w-20"
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    ref={registriereZelle(row.id, 'hinweis')}
                    className="w-40 rounded border border-transparent px-2 py-1 hover:border-slate-200 focus:border-slate-400"
                    value={row.hinweis ?? ''}
                    onChange={(e) => einheitFeldAendern(row, 'hinweis', e.target.value || null)}
                    onKeyDown={macheEnterHandler(rowIndex, 'hinweis')}
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
        {sichtbareZeilen.length === 0 && (
          <p className="p-4 text-sm text-slate-500">
            {einheiten.length === 0
              ? 'Noch keine Einheiten. Über „+ Zeile" manuell anlegen.'
              : 'Kein Eintrag für diesen Filter.'}
          </p>
        )}
      </div>
    </div>
  )
}
