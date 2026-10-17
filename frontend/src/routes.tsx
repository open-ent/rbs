import { RouteObject, createHashRouter } from 'react-router-dom';

import { Agenda } from './screens/Agenda';
import { BookingDetail } from './screens/BookingDetail';
import { BookingForm } from './screens/BookingForm';
import { Resource } from './screens/Resource';
import { Resources } from './screens/Resources';
import { Root } from './screens/Root';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Root />,
    children: [
      { index: true, element: <Agenda /> },
      { path: 'resources', element: <Resources /> },
      { path: 'agenda', element: <Agenda /> },
      { path: 'resource/:resourceId', element: <Resource /> },
      { path: 'moderation', element: <Agenda moderation /> },
      { path: 'booking/new', element: <BookingForm /> },
      { path: 'booking/:bookingId/edit', element: <BookingForm /> },
      { path: 'booking/:bookingId', element: <BookingDetail /> },
      { path: 'booking/:bookingId/:start', element: <BookingDetail /> },
    ],
  },
];

// Hash router : l'app est servie sous `/rbs` (route serveur unique `@Get("")`), le routage se fait
// dans le fragment (`/rbs#/agenda`). Évite les 404 sur accès direct / rechargement (F5) des
// sous-routes, que le `createBrowserRouter` provoquait faute de fallback SPA côté backend
// (comme l'ancienne IHM AngularJS en `#/`). CCTP 51C.
export const router = createHashRouter(routes);
