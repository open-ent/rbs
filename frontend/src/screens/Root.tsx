import { AppHeader, Breadcrumb, Layout, LoadingScreen, useEdificeClient } from '@open-ent/react';
import { useTranslation } from 'react-i18next';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';

import { useRbsRights } from '../hooks/useRbsRights';
import { setLanguage } from '../locale';

/**
 * Gabarit commun : bandeau ENT + onglets selon les droits, comme l'IHM AngularJS (top-menu.html) : « Calendrier »
 * pour tous, « Modération » pour qui peut valider, « Gestion » pour qui peut gérer des types ou des ressources.
 * Ex. un simple demandeur ne voit que le calendrier.
 */
export function Root() {
  const { t } = useTranslation(['rbs', 'common']);
  const { currentApp, currentLanguage, init } = useEdificeClient();
  const rights = useRbsRights();
  const { pathname } = useLocation();

  // La locale de formatage des dates suit la langue de la session (cf. locale.ts). Elle est posée pendant le
  // rendu, et non dans un effet : les écrans sont montés sous ce composant et formateraient leurs premières
  // dates en français avant que l'effet ne s'exécute.
  setLanguage(currentLanguage);

  if (!init || !rights.ready) return <LoadingScreen />;

  // Une adresse directe vers un onglet non autorisé renvoie au calendrier.
  if ((pathname.startsWith('/moderation') && !rights.moderate) || (pathname.startsWith('/resources') && !rights.manage)) return <Navigate to="/" replace />;

  const tabs = [
    { to: '/', end: true, label: t('rbs.tab.calendar', { defaultValue: 'Calendrier' }), show: true },
    { to: '/moderation', end: false, label: t('rbs.moderation.title', { defaultValue: 'Modération' }), show: rights.moderate },
    { to: '/schedule', end: false, label: t('rbs.roomSchedule.menu', { defaultValue: 'Disponibilité' }), show: true },
    { to: '/resources', end: false, label: t('rbs.tab.manage', { defaultValue: 'Gestion' }), show: rights.manage },
  ].filter((x) => x.show);

  return (
    <div className="d-flex flex-column vh-100">
      <Layout>
        <div className="d-print-none">
          <AppHeader>{currentApp && <Breadcrumb app={currentApp} />}</AppHeader>
        </div>
        <div className="flex-grow-1 overflow-auto">
          <div className="container py-16">
            <nav className="btn-group mb-16" aria-label={t('rbs.nav', { defaultValue: 'Navigation réservation de ressources' })}>
              {tabs.map((tab) => (
                <NavLink key={tab.to} to={tab.to} end={tab.end} className={({ isActive }) => `btn btn-${isActive ? 'primary' : 'secondary'}`}>
                  {tab.label}
                </NavLink>
              ))}
            </nav>
            <Outlet />
            {/* Marge basse (un `py-*` du thème l'emporterait sur un padding) : le bouton flottant de bascule d'interface occupe le coin bas droit, les actions de bas de page doivent pouvoir défiler au-dessus. */}
            <div aria-hidden style={{ height: 88 }} />
          </div>
        </div>
      </Layout>
    </div>
  );
}

export default Root;
