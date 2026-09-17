import { useEffect, useRef, useState, type DragEvent } from 'react'
import { supabase } from '../lib/supabase'
import { starteImport, ladeImport, istUnterstuetzteDatei } from '../lib/daten/importe'
import {
  formatEuro,
  formatEuroSigned,
  formatFlaeche,
  formatFlaecheSigned,
  parseGroesseZuHundertstel,
  summeHundertstel,
  summeKaufpreise,
  vergleicheMitToleranz,
} from '../lib/zahlen'
import type { Import } from '../types/database'

const TOLERANZ_FLAECHE_HUNDERTSTEL = 5 // 0,05 m²
const TOLERANZ_KAUFPREIS = 1 // 1 €
const POLL_INTERVALL_MS = 1500

type Phase = 'idle' | 'hochladen' | 'verarbeitung' | 'pruefung' | 'fehler'

const STATUS_TEXT: Record<Import['status'], string> = {
  wird_geparst: 'Datei wird gelesen…',
  wird_erkannt: 'Einheiten werden erkannt…',
  fertig: 'Fertig.',
  fehler: 'Fehlgeschlagen.',
}

interface Props {
  projektId: string
  bestehendeAnzahl: number
  onUebernommen: () => void
}

export function ImportBereich({ projektId, bestehendeAnzahl, onUebernommen }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [importZeile, setImportZeile] = useState<Import | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [uebernahmeModus, setUebernahmeModus] = useState<'anhaengen' | 'ersetzen'>('anhaengen')
  const [dragAktiv, setDragAktiv] = useState(false)
  const [uebernehmeLaeuft, setUebernehmeLaeuft] = useState(false)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current)
    }
  }, [])

  function pollingStarten(id: string) {
    pollTimer.current = setInterval(async () => {
      try {
        const zeile = await ladeImport(id)
        if (zeile.status === 'fertig') {
          if (pollTimer.current) clearInterval(pollTimer.current)
          setImportZeile(zeile)
          setPhase('pruefung')
        } else if (zeile.status === 'fehler') {
          if (pollTimer.current) clearInterval(pollTimer.current)
          setFehler(zeile.fehler ?? 'Unbekannter Fehler.')
          setPhase('fehler')
        } else {
          setImportZeile(zeile)
        }
      } catch (e) {
        if (pollTimer.current) clearInterval(pollTimer.current)
        setFehler(e instanceof Error ? e.message : String(e))
        setPhase('fehler')
      }
    }, POLL_INTERVALL_MS)
  }

  async function dateiVerarbeiten(datei: File) {
    if (!istUnterstuetzteDatei(datei.name)) {
      setFehler(`Dateityp nicht unterstützt: ${datei.name}`)
      setPhase('fehler')
      return
    }
    setPhase('hochladen')
    setFehler(null)
    try {
      const id = await starteImport(projektId, datei)
      setPhase('verarbeitung')
      pollingStarten(id)
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
      setPhase('fehler')
    }
  }

  function abbrechen() {
    if (pollTimer.current) clearInterval(pollTimer.current)
    // Die Function läuft serverseitig ggf. weiter — "Abbrechen" beendet nur
    // das Warten/Anzeigen hier. Der importe-Datensatz bleibt nachvollziehbar
    // stehen, egal ob die Verarbeitung noch fertig wird oder nicht.
    setPhase('idle')
    setImportZeile(null)
  }

  async function uebernehmen() {
    if (!importZeile?.modell_antwort) return
    setUebernehmeLaeuft(true)
    try {
      if (uebernahmeModus === 'ersetzen') {
        const { error } = await supabase.from('einheiten').delete().eq('projekt_id', projektId)
        if (error) throw error
      }
      const startIndex = uebernahmeModus === 'ersetzen' ? 0 : bestehendeAnzahl
      const zeilen = importZeile.modell_antwort.einheiten.map((e, i) => ({
        projekt_id: projektId,
        bezeichnung: e.bezeichnung,
        typ: e.typ,
        etage: e.etage,
        zimmer: e.zimmer,
        groesse: e.groesse,
        kaufpreis: e.kaufpreis,
        kaltmiete: e.kaltmiete,
        status: e.status,
        garage: e.garage,
        garage_preis: e.garagePreis,
        stellplatz: e.stellplatz,
        stellplatz_preis: e.stellplatzPreis,
        hinweis: e.hinweis,
        sortierung: startIndex + i,
      }))
      const { error } = await supabase.from('einheiten').insert(zeilen)
      if (error) throw error
      onUebernommen()
      verwerfen()
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
      setPhase('fehler')
    } finally {
      setUebernehmeLaeuft(false)
    }
  }

  function verwerfen() {
    setPhase('idle')
    setImportZeile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragAktiv(false)
    const datei = e.dataTransfer.files[0]
    if (datei) dateiVerarbeiten(datei)
  }

  if (phase === 'idle') {
    return (
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragAktiv(true)
        }}
        onDragLeave={() => setDragAktiv(false)}
        onDrop={onDrop}
        className={`mb-6 rounded-lg border-2 border-dashed p-6 text-center text-sm ${
          dragAktiv ? 'border-slate-500 bg-slate-50' : 'border-slate-300'
        }`}
      >
        <p className="mb-2 text-slate-600">
          Preisliste hierher ziehen oder{' '}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="font-medium text-slate-900 underline"
          >
            Datei auswählen
          </button>
        </p>
        <p className="text-xs text-slate-400">PDF, XLSX, XLSM, XLS</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.xlsx,.xlsm,.xls"
          className="hidden"
          onChange={(e) => {
            const datei = e.target.files?.[0]
            if (datei) dateiVerarbeiten(datei)
          }}
        />
      </div>
    )
  }

  if (phase === 'hochladen' || phase === 'verarbeitung') {
    const statusText =
      phase === 'hochladen' ? 'Datei wird hochgeladen…' : STATUS_TEXT[importZeile?.status ?? 'wird_geparst']
    return (
      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-6 text-center">
        <p className="mb-3 text-sm text-slate-700">{statusText}</p>
        <button
          onClick={abbrechen}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
        >
          Abbrechen
        </button>
      </div>
    )
  }

  if (phase === 'fehler') {
    return (
      <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-6">
        <p className="mb-3 text-sm text-red-700">Import fehlgeschlagen: {fehler}</p>
        <button
          onClick={verwerfen}
          className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700"
        >
          Schließen
        </button>
      </div>
    )
  }

  // phase === 'pruefung'
  const ergebnis = importZeile!.modell_antwort!
  const einheiten = ergebnis.einheiten
  const wohnungen = einheiten.filter((e) => e.typ === 'wohnung')
  const flaecheHundertstel = summeHundertstel(wohnungen.map((e) => parseGroesseZuHundertstel(e.groesse)))
  const kaufpreis = summeKaufpreise(einheiten.map((e) => e.kaufpreis))
  const summenZeile = ergebnis.summenZeile

  const flaecheAbgleich =
    summenZeile?.flaeche != null
      ? vergleicheMitToleranz(flaecheHundertstel, Math.round(summenZeile.flaeche * 100), TOLERANZ_FLAECHE_HUNDERTSTEL)
      : null
  const kaufpreisAbgleich =
    summenZeile?.kaufpreis != null
      ? vergleicheMitToleranz(kaufpreis.summe, Math.trunc(summenZeile.kaufpreis), TOLERANZ_KAUFPREIS)
      : null

  return (
    <div className="mb-6 rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="mb-1 font-semibold text-slate-900">Prüfansicht: {importZeile!.dateiname}</h2>
      <p className="mb-4 text-sm text-slate-500">
        {einheiten.length} Einheiten erkannt · {kaufpreis.anzahlMitPreis} von {kaufpreis.anzahlGesamt} mit Preis
      </p>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded border border-slate-200 p-3 text-sm">
          <p className="text-slate-500">Wohnfläche (eigene Summe, nur Typ wohnung)</p>
          <p className="font-medium tabular-nums">{formatFlaeche(flaecheHundertstel)} m²</p>
          {summenZeile ? (
            flaecheAbgleich && (
              <p className={flaecheAbgleich.status === 'uebereinstimmung' ? 'text-green-700' : 'text-amber-700'}>
                {flaecheAbgleich.status === 'uebereinstimmung'
                  ? '✓ stimmt mit Summenzeile der Quelle überein'
                  : `Abweichung zur Summenzeile: ${formatFlaecheSigned(flaecheAbgleich.differenz)}`}
              </p>
            )
          ) : (
            <p className="text-slate-500">Keine Summenzeile in der Quelle.</p>
          )}
        </div>
        <div className="rounded border border-slate-200 p-3 text-sm">
          <p className="text-slate-500">Kaufpreissumme (eigene Summe)</p>
          <p className="font-medium tabular-nums">{formatEuro(kaufpreis.summe)}</p>
          {summenZeile ? (
            kaufpreisAbgleich && (
              <p className={kaufpreisAbgleich.status === 'uebereinstimmung' ? 'text-green-700' : 'text-amber-700'}>
                {kaufpreisAbgleich.status === 'uebereinstimmung'
                  ? '✓ stimmt mit Summenzeile der Quelle überein'
                  : `Abweichung zur Summenzeile: ${formatEuroSigned(kaufpreisAbgleich.differenz)}`}
              </p>
            )
          ) : (
            <p className="text-slate-500">Keine Summenzeile in der Quelle.</p>
          )}
        </div>
      </div>

      {importZeile!.hinweise && importZeile!.hinweise.length > 0 && (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-3">
          <p className="mb-1 text-sm font-medium text-amber-900">Hinweise des Modells</p>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-amber-800">
            {importZeile!.hinweise.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-4 overflow-x-auto rounded border border-slate-200">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-2 py-1.5">Bezeichnung</th>
              <th className="px-2 py-1.5">Typ</th>
              <th className="px-2 py-1.5">Etage</th>
              <th className="px-2 py-1.5">Zimmer</th>
              <th className="px-2 py-1.5">Größe</th>
              <th className="px-2 py-1.5 text-right">Kaufpreis</th>
              <th className="px-2 py-1.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {einheiten.map((e, i) => (
              <tr key={i}>
                <td className="px-2 py-1">{e.bezeichnung}</td>
                <td className="px-2 py-1">{e.typ}</td>
                <td className="px-2 py-1">{e.etage ?? ''}</td>
                <td className="px-2 py-1">{e.zimmer ?? ''}</td>
                <td className="px-2 py-1 tabular-nums">{e.groesse ?? ''}</td>
                <td className="px-2 py-1 text-right tabular-nums">{formatEuro(e.kaufpreis)}</td>
                <td className="px-2 py-1">{e.status ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {bestehendeAnzahl > 0 && (
        <div className="mb-4 flex gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={uebernahmeModus === 'anhaengen'}
              onChange={() => setUebernahmeModus('anhaengen')}
            />
            Anhängen ({bestehendeAnzahl} bestehende bleiben)
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={uebernahmeModus === 'ersetzen'}
              onChange={() => setUebernahmeModus('ersetzen')}
            />
            Ersetzen ({bestehendeAnzahl} bestehende werden gelöscht)
          </label>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          onClick={verwerfen}
          className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700"
        >
          Verwerfen
        </button>
        <button
          onClick={uebernehmen}
          disabled={uebernehmeLaeuft}
          className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {uebernehmeLaeuft ? 'Übernehme…' : 'Übernehmen'}
        </button>
      </div>
    </div>
  )
}
