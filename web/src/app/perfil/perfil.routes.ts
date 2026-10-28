import { Routes } from '@angular/router';
import { HistorialPage } from '../finanzas/historial/historial-page';
import { CatalogosPage } from './catalogos-page';
import { MisionesPage } from './misiones-page';
import { PerfilPage } from './perfil-page';

export const PERFIL_ROUTES: Routes = [
  { path: '', component: PerfilPage },
  { path: 'misiones', component: MisionesPage },
  { path: 'catalogos', component: CatalogosPage },
  { path: 'historial', component: HistorialPage },
];
