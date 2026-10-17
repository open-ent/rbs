import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, EdtImportReport } from '../api';

const pad = (n: number) => String(n).padStart(2, '0');
const dayValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromDay = (v: string) => {
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const HINT = { fontStyle: 'italic', color: '#767676' } as const;

/** Fin d'année scolaire proposée : le 5 juillet qui suit (de la rentrée d'août à juillet de l'année d'après). */
export function endOfSchoolYear(today = new Date()): Date {
  return new Date(today.getMonth() >= 7 ? today.getFullYear() + 1 : today.getFullYear(), 6, 5);
}

/**
 * Génération des réservations depuis l'Emploi du temps (parité IHM AngularJS, besoins récurrents avant la rentrée) : pour
 * chaque cours publié, la réservation correspondante est créée pour toute l'année. Toujours un aperçu d'abord (rien
 * n'est créé), puis la confirmation. Le compte rendu liste ce qui serait créé, ce qui existe déjà, les conflits, les
 * salles introuvables et les réservations devenues sans objet.
 */
export function EdtImportForm({ structureId, onClose }: { structureId: string; onClose: () => void }) {
  const { t } = useTranslation(['rbs', 'common']);
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => dayValue(new Date()));
  const [weeks, setWeeks] = useState(1);
  const [until, setUntil] = useState(() => dayValue(endOfSchoolYear()));
  const [report, setReport] = useState<{ data: EdtImportReport; confirmed: boolean } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const run = async (dryRun: boolean) => {
    // Jamais de requête avec des dates vides : mieux vaut un message clair qu'un calcul sur une date par défaut.
    if (!weekStart || !until) {
      setError(t('rbs.edtImport.missingDates', { defaultValue: 'Choisissez d’abord une semaine et une date de fin avant de continuer.' }));
      return;
    }
    setLoading(true);
    setError('');
    try {
      const count = Math.max(1, Math.min(8, Math.floor(weeks) || 1));
      const start = fromDay(weekStart);
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + count * 7 - 1);
      const data = await api.importFromEdt(structureId, { startAt: dayValue(start), endAt: dayValue(end), periodicEndDate: Math.floor(fromDay(until).getTime() / 1000), dryRun });
      setReport({ data, confirmed: !dryRun });
      if (!dryRun) await qc.invalidateQueries({ queryKey: ['rbs'] });
    } catch {
      setError(t('rbs.edtImport.error', { defaultValue: 'Une erreur est survenue, rien n’a été créé.' }));
    } finally {
      setLoading(false);
    }
  };

  const row = (label: string, body: React.ReactNode, hint: string, htmlFor: string) => (
    <div className="mb-12">
      <div className="d-flex gap-12 flex-wrap">
        <label htmlFor={htmlFor} style={{ minWidth: 260 }} className="mb-0">
          {label}
        </label>
        {body}
      </div>
      <div style={{ ...HINT, marginLeft: 272 }}>{hint}</div>
    </div>
  );
  const list = (items: string[]) => (items.length > 0 ? <ul>{items.map((x, i) => <li key={i}>{x}</li>)}</ul> : null);
  const r = report?.data;

  return (
    <div data-edt-import>
      <h2>{t('rbs.edtImport.title', { defaultValue: "Générer les réservations depuis l'Emploi du temps" })}</h2>
      <p style={HINT}>{t('rbs.edtImport.help', { defaultValue: "Pour chaque cours déjà publié dans l'Emploi du temps, crée automatiquement la réservation correspondante pour toute l'année." })}</p>
      {row(t('rbs.edtImport.weekStart', { defaultValue: 'Choisissez une semaine où les cours sont normalement donnés' }), <input id="rbs-edt-week" type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />, t('rbs.edtImport.weekStart.hint', { defaultValue: 'Une semaine sans vacances suffit.' }), 'rbs-edt-week')}
      {row(t('rbs.edtImport.weeksToScan', { defaultValue: 'Sur combien de semaines regarder ?' }), <input id="rbs-edt-weeks" type="number" min={1} max={8} style={{ width: 90 }} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} />, t('rbs.edtImport.weeksToScan.hint', { defaultValue: "1 suffit si l'emploi du temps est identique chaque semaine." }), 'rbs-edt-weeks')}
      {row(t('rbs.edtImport.periodicEndDate', { defaultValue: 'Jusqu’à quand les réservations doivent-elles durer ?' }), <input id="rbs-edt-until" type="date" value={until} onChange={(e) => setUntil(e.target.value)} />, t('rbs.edtImport.periodicEndDate.hint', { defaultValue: "En général la fin de l'année scolaire." }), 'rbs-edt-until')}
      {error && <div className="alert alert-warning" role="alert">{error}</div>}
      <div className="d-flex justify-content-end gap-8 mb-16">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          {t('rbs.cancel', { defaultValue: 'Annuler' })}
        </button>
        <button type="button" className="btn btn-primary" disabled={loading} onClick={() => run(true)}>
          {loading ? t('rbs.processing', { defaultValue: 'Enregistrement en cours' }) : t('rbs.edtImport.preview', { defaultValue: 'Aperçu (rien n’est créé)' })}
        </button>
      </div>

      {r && (
        <div data-edt-report>
          <hr />
          <h3 style={{ fontSize: 18 }}>{report!.confirmed ? t('rbs.edtImport.report.confirmed.title', { defaultValue: 'Réservations créées' }) : t('rbs.edtImport.report.preview.title', { defaultValue: 'Aperçu — rien n’a encore été créé' })}</h3>
          <p>
            {t('rbs.edtImport.report.created', { defaultValue: 'Réservations qui seront créées' })} : <strong data-count="created">{r.created.length}</strong>
          </p>
          {list(r.created.map((c) => c.bookingReason))}
          <p>
            {t('rbs.edtImport.report.skippedExisting', { defaultValue: 'Déjà couvertes (rien à faire)' })} : <strong data-count="skipped">{r.skippedExisting.length}</strong>
          </p>
          {list(r.skippedExisting.map((c) => c.bookingReason))}
          <p>
            {t('rbs.edtImport.report.conflicts', { defaultValue: 'En conflit avec une réservation existante (non créées)' })} : <strong data-count="conflicts">{r.conflicts.length}</strong>
          </p>
          <p style={HINT}>{t('rbs.edtImport.report.conflicts.hint', { defaultValue: 'Ces créneaux ne seront pas créés car la salle est déjà prise.' })}</p>
          {r.conflicts.length > 0 && (
            <ul className="text-warning">
              {r.conflicts.map((c, i) => (
                <li key={i}>
                  {c.bookingReason} {t('rbs.edtImport.report.conflicts.alreadyBookedBy', { defaultValue: 'figure déjà dans l’agenda :' })}
                  {list(c.existingBookings.map((e) => e.range))}
                </li>
              ))}
            </ul>
          )}
          <p>
            {t('rbs.edtImport.report.unmatchedRooms', { defaultValue: 'Salle introuvable dans les ressources (non créées)' })} : <strong data-count="unmatched">{r.unmatchedRooms.length}</strong>
          </p>
          <p style={HINT}>{t('rbs.edtImport.report.unmatchedRooms.hint', { defaultValue: "Le nom de la salle indiqué dans l'Emploi du temps ne correspond à aucune ressource." })}</p>
          {r.unmatchedRooms.length > 0 && (
            <ul>
              {r.unmatchedRooms.map((room, i) => (
                <li key={i}>
                  {room.roomLabel} ({room.occurrences}){list(room.courseLabels)}
                </li>
              ))}
            </ul>
          )}
          <p>
            {t('rbs.edtImport.report.obsolete', { defaultValue: 'Réservations qui ne correspondent plus à rien (à annuler)' })} : <strong data-count="obsolete">{r.obsolete.length}</strong>
          </p>
          <p style={HINT}>{t('rbs.edtImport.report.obsolete.hint', { defaultValue: 'Un cours a changé de salle depuis la dernière génération.' })}</p>
          {r.obsolete.length > 0 && <ul className="text-warning">{r.obsolete.map((o, i) => <li key={i}>{o.bookingReason}</li>)}</ul>}
          {!report!.confirmed && (r.created.length > 0 || r.obsolete.length > 0) && (
            <div className="d-flex justify-content-end">
              <button type="button" className="btn btn-primary" disabled={loading} onClick={() => run(false)}>
                {t('rbs.edtImport.confirm', { defaultValue: 'Confirmer la création des réservations' })}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default EdtImportForm;
