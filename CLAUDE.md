# Objektlisten — Kernregeln

Interne Webapp für Estateanfrage: Kaufpreislisten von Bauträgern (Excel/PDF) werden
per KI in eine geprüfte, editierbare Einheitenliste überführt.

## Stack

- Vite + React + TypeScript, Tailwind
- Supabase: Postgres, Auth (nur Teamkonten, kein Self-Signup), Storage
- Netlify Hosting + Functions. Functions liegen unter `netlify/functions`, sind
  aber über `netlify.toml`-Redirect als `/api/*` ansprechbar — Code, der `/api/...`
  aufruft, muss beim Wechsel des Hosters nicht angefasst werden.
- Anthropic SDK **ausschließlich serverseitig** in einer Function, Modell `claude-sonnet-4-6`.
  API-Key nur als Env-Var, darf nie im Client-Bundle landen.
- Parsing **serverseitig**, nicht im Browser (siehe unten)

## Warum Parsing serverseitig läuft

Vertriebsstand steht in vielen Excel-Preislisten nur in der Zellfarbe, nicht im Text.
Die Browser-Bibliothek SheetJS liest Füllfarben in der Open-Source-Variante
unzuverlässig. Deshalb: **exceljs** auf dem Server, Füllfarbe über
`cell.fill.fgColor.argb`. Wenn exceljs bei einer Testdatei keine Farben liefert:
sofort melden, nicht stillschweigend weglassen.

PDFs: **pdfjs-dist** serverseitig, mit Positionsdaten. Zeilen über y-Koordinate,
Spalten über x-Abstand rekonstruieren. Reiner Textdump reicht nicht bei
mehrspaltigen Exposés.

## Datenmodell (siehe supabase/migrations)

- `projekte`: inkl. `kontrolle_flaeche` / `kontrolle_kaufpreis` als Abgleichswerte
  aus der Summenzeile der Quelle.
- `einheiten`: `kaufpreis` ist **nullable** — verkaufte Einheiten haben oft keinen
  Preis mehr in der Quelle, `0` wäre eine Falschaussage.
- `importe`: Rohtext + Modellantwort + Hinweise pro Upload, für Nachvollziehbarkeit.

## Extraktionsregeln (System-Prompt + Testfälle)

- Nur echte Einheiten, keine Überschriften/Summen/Legendenzeilen.
- Stellplätze, Garagen, Gewerbe, Hobbyräume: eigener `typ`, niemals `wohnung`.
- Allgemeine Stellplatzoptionen (nicht einer konkreten Einheit zugeordnet) sind
  keine Einheiten, sondern Hinweise. `garage`/`stellplatz` nur `true` bei
  konkreter Zuordnung in der Quelle.
- Wort statt Zahl in der Preisspalte („verkauft", „reserviert") → das ist der
  Status, Preis bleibt `null`.
- Zimmerzahl auch aus Fließtext ziehen ("2 ZIMMERWOHNUNG" → `zimmer: "2"`).
- `groesse` bleibt Text, exakt wie Quelle, deutsches Komma. Nicht runden/umrechnen.
- Farbmarker nur mit vorhandener Legende auswerten. Ohne Legende: Farben in
  Hinweise schreiben, nicht raten.
- Summenzeilen der Quelle zurückgeben, nichts selbst addieren — App vergleicht
  eigene Summe gegen Quellsumme.
- Hinweise auf Deutsch und konkret.
- Nichts erfinden. Fehlendes bleibt leer/null.

## Zahlenkonventionen (überall: UI, Export, Berechnung)

- Nie auf-/abrunden.
- Geldbeträge ohne Cent, Cent wird abgeschnitten (10.665,60 € → 10.665 €).
- Berechnete Prozentwerte: 2 Nachkommastellen (14,96 %).
- Glatte gesetzliche Prozentsätze: keine Nachkommastellen (9 %, 75 %).
- m²-Angaben exakt wie Quelle.
- €/m² im einstelligen Bereich mit Cent (9,16 €/m²).

## CSV-Export

Muss byteweise zum bestehenden Vorlagenformat passen: Semikolon-getrennt, UTF-8
mit BOM, deutsche Dezimalkommas, Spaltenreihenfolge:

```
Bezeichnung;Etage;Zimmer;Größe;Kaufpreis;Kaltmiete;Status;Garage;Garage_Preis;Stellplatz;Stellplatz_Preis
```

Kaufpreis/Kaltmiete als ganze Zahlen ohne Tausenderpunkte. Garage/Stellplatz als
„Ja"/„Nein". Wohnungen und sonstige Einheiten als getrennte Exporte.

## Ablauf — Prüfschritt ist Pflicht

Upload → Parser → Claude-Extraktion → **Prüfansicht (Mensch bestätigt/korrigiert)**
→ erst dann Schreiben in `einheiten` → editierbare Tabelle.

Schritt "Prüfansicht" darf nicht übersprungen werden können. Keine automatische
Übernahme ohne menschliche Freigabe.

## Was nicht gemacht wird

- Kein Mock, keine erfundenen Beispieldaten in der UI.
- Keine stillschweigende Korrektur von Quelldaten — Widersprüche werden angezeigt.
- Kein API-Key im Client, in keiner Zwischenstufe.
- Keine automatische Übernahme ohne menschliche Freigabe.

## Golden Tests

`fixtures/`: `Testliste_Wohnpark_Lerchenfeld.xlsx`, `Testliste_Wohnpark_Lerchenfeld_PDF.pdf`,
`M4_Preise_ges_V06.pdf`. Erwartete Werte siehe Projektspezifikation / Testdateien
selbst. Parser-Tests laufen ohne API-Aufruf; Extraktions-Tests gegen gespeicherte
Modellantwort-Snapshots, damit sie ohne Netzwerk durchlaufen.

## Phasen

1. Gerüst: Vite/React/TS, Supabase, Auth, Migrations, Projekte CRUD, leere
   Einheitentabelle mit Inline-Bearbeitung.
2. Parser: Upload, Storage, Excel-/PDF-Parser als Functions, Rohtext sichtbar,
   Tests gegen alle drei Fixtures, noch ohne KI.
3. Extraktion: Claude-Function, Prüfansicht, Summenabgleich, Übernahme.
4. Export und Betrieb: CSV, Importhistorie, Fehlerbehandlung, Deployment.

Nach jeder Phase anhalten und Ergebnis zeigen, bevor es weitergeht.
