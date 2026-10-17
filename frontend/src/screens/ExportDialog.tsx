import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '../api';
import { clampRange, dayValue, earliestStart, ExportChoice, exportBody, exportFilename, latestEnd } from '../exportOptions';
import { Modal } from './Modal';

const IANA = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris';

/** Déclenche le téléchargement d'un Blob côté navigateur. */
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

interface Props {
  /** Ressources cochées dans l'arbre (« les ressources affichées »). */
  selectedIds: number[];
  /** Toutes les ressources de l'usager. */
  allIds: number[];
  onClose: () => void;
}

/**
 * Export des réservations (parité IHM AngularJS), en quatre choix : format (PDF ou iCalendar), ressources (affichées ou
 * toutes), période (au plus 12 semaines, bornes recadrées à la saisie) et, pour le PDF, vue (semaine, jour ou liste).
 * Les réservations en attente de validation ne sont pas exportées.
 */
export function ExportDialog({ selectedIds, allIds, onClose }: Props) {
  const { t } = useTranslation(['rbs', 'common']);
  const today = new Date();
  const [choice, setChoice] = useState<ExportChoice>({
    format: 'PDF',
    scope: selectedIds.length > 0 ? 'selected' : 'all',
    view: 'WEEK',
    start: dayValue(today),
    end: dayValue(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 6)),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = <K extends keyof ExportChoice>(key: K, value: ExportChoice[K]) => setChoice((c) => ({ ...c, [key]: value }));
  const setDates = (start: string, end: string) => setChoice((c) => ({ ...c, ...clampRange(start || c.start, end || c.end) }));

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const blob = await api.exportBookings(exportBody(choice, selectedIds, allIds, IANA));
      download(blob, exportFilename(choice.format));
      onClose();
    } catch {
      setError(choice.format === 'PDF' ? t('rbs.export.pdf.error', { defaultValue: "L'export PDF est indisponible (service de génération PDF requis)." }) : t('rbs.export.error', { defaultValue: "L'export a échoué." }));
    } finally {
      setBusy(false);
    }
  };

  const radio = (name: string, label: string, checked: boolean, onChange: () => void) => (
    <label className="d-flex align-items-center gap-4 me-16">
      <input type="radio" name={name} checked={checked} onChange={onChange} />
      {label}
    </label>
  );
  const section = (title: string, body: React.ReactNode) => (
    <fieldset className="mb-16">
      <legend style={{ fontSize: 16 }} className="mb-8">
        {title}
      </legend>
      {body}
    </fieldset>
  );

  return (
    <Modal title={t('rbs.export.title', { defaultValue: 'Export' })} onClose={onClose}>
      <div data-export-dialog>
        {section(
          t('rbs.export.format', { defaultValue: '1 - Format' }),
          <div className="d-flex">
            {radio('exp-format', t('rbs.export.format.pdf', { defaultValue: 'PDF' }), choice.format === 'PDF', () => set('format', 'PDF'))}
            {radio('exp-format', t('rbs.export.format.ical', { defaultValue: 'ICal' }), choice.format === 'ICAL', () => set('format', 'ICAL'))}
          </div>,
        )}
        {section(
          t('rbs.export.resource', { defaultValue: '2 - Ressources' }),
          <>
            <div className="d-flex">
              {radio('exp-scope', t('rbs.export.resource.selected', { defaultValue: 'Les ressources affichées' }), choice.scope === 'selected', () => set('scope', 'selected'))}
              {radio('exp-scope', t('rbs.export.resource.all', { defaultValue: 'Toutes les ressources' }), choice.scope === 'all', () => set('scope', 'all'))}
            </div>
            <p className="text-warning mb-0">{t('rbs.export.resource.warning', { defaultValue: 'Les ressources en attente de validation ne seront pas exportées' })}</p>
          </>,
        )}
        {section(
          t('rbs.export.date', { defaultValue: '3 - Période' }),
          <>
            <div className="d-flex gap-16 flex-wrap">
              <label className="d-flex align-items-center gap-8">
                {t('rbs.export.date.start', { defaultValue: 'Du ' })}
                <input type="date" value={choice.start} min={dayValue(earliestStart())} onChange={(e) => setDates(e.target.value, choice.end)} />
              </label>
              <label className="d-flex align-items-center gap-8">
                {t('rbs.export.date.end', { defaultValue: 'Au ' })}
                <input type="date" value={choice.end} min={choice.start} max={dayValue(latestEnd(new Date(choice.start)))} onChange={(e) => setDates(choice.start, e.target.value)} />
              </label>
            </div>
            <p className="text-warning mb-0">{t('rbs.export.warning.max.date', { defaultValue: "L'export des réservations se limite à une plage de 12 semaines" })}</p>
          </>,
        )}
        {choice.format === 'PDF' &&
          section(
            t('rbs.export.view', { defaultValue: '4 - Vue' }),
            <div className="d-flex">
              {radio('exp-view', t('rbs.export.view.week', { defaultValue: 'Semaine' }), choice.view === 'WEEK', () => set('view', 'WEEK'))}
              {radio('exp-view', t('rbs.export.view.day', { defaultValue: 'Jour' }), choice.view === 'DAY', () => set('view', 'DAY'))}
              {radio('exp-view', t('rbs.export.view.list', { defaultValue: 'Liste' }), choice.view === 'LIST', () => set('view', 'LIST'))}
            </div>,
          )}
      </div>
      {error && (
        <div className="alert alert-warning" role="alert">
          {error}
        </div>
      )}
      <div className="d-flex justify-content-end gap-8">
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>
          {t('rbs.cancel', { defaultValue: 'Annuler' })}
        </button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
          {busy ? t('rbs.processing', { defaultValue: 'Enregistrement en cours' }) : t('rbs.export', { defaultValue: 'Exporter' })}
        </button>
      </div>
    </Modal>
  );
}

export default ExportDialog;
