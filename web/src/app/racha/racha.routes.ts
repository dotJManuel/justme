import { Routes } from '@angular/router';
import { LogrosPage } from './logros-page';
import { NivelesPage } from './niveles-page';
import { RachaHoy } from './racha-hoy';
import { RachaPage } from './racha-page';

export const RACHA_ROUTES: Routes = [
  {
    path: '',
    component: RachaPage,
    children: [
      { path: '', component: RachaHoy },
      { path: 'logros', component: LogrosPage },
      { path: 'niveles', component: NivelesPage },
    ],
  },
];
