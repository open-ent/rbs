import { RouteObject, createBrowserRouter } from 'react-router-dom';

import { Resource } from './screens/Resource';
import { Resources } from './screens/Resources';
import { Root } from './screens/Root';

// Réécrit à la racine du module (`/rbs` en prod). En dev, racine `/`.
export const basename = import.meta.env.PROD ? '/rbs' : '/';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Root />,
    children: [
      { index: true, element: <Resources /> },
      { path: 'resource/:resourceId', element: <Resource /> },
    ],
  },
];

export const router = createBrowserRouter(routes, { basename });
