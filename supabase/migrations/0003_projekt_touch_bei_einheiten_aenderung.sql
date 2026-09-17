-- Die Projektübersicht zeigt "zuletzt geändert", holt aber aus der
-- verschachtelten Query bewusst nur `einheiten(status)` (keine updated_at
-- Spalte, um die Abfrage schlank zu halten). Damit "zuletzt geändert" trotzdem
-- Änderungen an den Einheiten widerspiegelt und nicht nur Änderungen am
-- Projekt-Datensatz selbst, rührt jede Einheiten-Änderung den Zeitstempel des
-- übergeordneten Projekts mit an.
create or replace function touch_projekt_updated_at()
returns trigger as $$
begin
  update projekte set updated_at = now()
  where id = coalesce(new.projekt_id, old.projekt_id);
  return coalesce(new, old);
end;
$$ language plpgsql;

create trigger einheiten_touch_projekt
  after insert or update or delete on einheiten
  for each row execute function touch_projekt_updated_at();
