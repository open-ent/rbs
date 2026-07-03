import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '../api';
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

/** Export des réservations sur une période (iCalendar ou PDF). */
export function ExportDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(['rbs', 'common']);
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const [startdate, setStartdate] = useState(iso(today));
  const [enddate, setEnddate] = useState(iso(new Date(today.getTime() + 30 * 86400000)));
  const [format, setFormat] = useState<'ICAL' | 'PDF'>('ICAL');
  const [error, setError] = useState('');

  const exportMut = useMutation({
    mutationFn: async () => {
      const blob = await api.exportBookings({ startdate, enddate, format, view: 'LIST', usertimezone: IANA });
      download(blob, format === 'ICAL' ? 'reservations.ics' : 'reservations.pdf');
    },
    onSuccess: () => {
      setError('');
      onClose();
    },
    onError: () =>
      setError(
        format === 'PDF'
          ? t('rbs.export.pdf.error', { defaultValue: "L'export PDF est indisponible (service de génération PDF requis)." })
          : t('rbs.export.error', { defaultValue: "L'export a échoué." }),
      ),
  });

  return (
    <Modal title={t('rbs.export.title', { defaultValue: 'Exporter les réservations' })} onClose={onClose}>
      <div className="d-flex gap-16 flex-wrap mb-12">
        <div>
          <label htmlFor="exp-sd" className="form-label">
            {t('rbs.availability.from', { defaultValue: 'Du' })}
          </label>
          <input id="exp-sd" type="date" className="form-control" value={startdate} onChange={(e) => setStartdate(e.target.value)} />
        </div>
        <div>
          <label htmlFor="exp-ed" className="form-label">
            {t('rbs.availability.to', { defaultValue: 'Au' })}
          </label>
          <input id="exp-ed" type="date" className="form-control" value={enddate} onChange={(e) => setEnddate(e.target.value)} />
        </div>
      </div>

      <div className="mb-16">
        <span className="form-label d-block">{t('rbs.export.format', { defaultValue: 'Format' })}</span>
        <label className="d-flex align-items-center gap-4 mb-4">
          <input type="radio" name="exp-fmt" checked={format === 'ICAL'} onChange={() => setFormat('ICAL')} />
          {t('rbs.export.ical', { defaultValue: 'Agenda (iCalendar .ics)' })}
        </label>
        <label className="d-flex align-items-center gap-4">
          <input type="radio" name="exp-fmt" checked={format === 'PDF'} onChange={() => setFormat('PDF')} />
          {t('rbs.export.pdf', { defaultValue: 'PDF' })}
        </label>
      </div>

      {error && (
        <div className="alert alert-warning" role="alert">
          {error}
        </div>
      )}

      <div className="d-flex justify-content-end gap-8">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          {t('rbs.cancel', { defaultValue: 'Annuler' })}
        </button>
        <button type="button" className="btn btn-primary" disabled={exportMut.isPending} onClick={() => exportMut.mutate()}>
          {t('rbs.export.submit', { defaultValue: 'Exporter' })}
        </button>
      </div>
    </Modal>
  );
}

export default ExportDialog;
