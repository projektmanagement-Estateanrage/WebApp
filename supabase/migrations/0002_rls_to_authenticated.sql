-- auth.role() = 'authenticated' im USING-Ausdruck ist zu dünn: die Rolle wird
-- damit erst innerhalb der Policy-Auswertung geprüft. Mit `TO authenticated`
-- schließt schon Postgres selbst die Rolle `anon` auf Policy-Ebene aus, bevor
-- der USING-Ausdruck überhaupt läuft — robuster gegen einen Ausdruck, der
-- sich bei künftigen Umbauten verliert.
alter policy "team liest projekte" on projekte to authenticated;
alter policy "team schreibt projekte" on projekte to authenticated;

alter policy "team liest einheiten" on einheiten to authenticated;
alter policy "team schreibt einheiten" on einheiten to authenticated;

alter policy "team liest importe" on importe to authenticated;
alter policy "team schreibt importe" on importe to authenticated;
