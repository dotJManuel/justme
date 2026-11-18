import { Routes } from '@angular/router';
import { NotaPage } from './nota-page';
import { NotasPage } from './notas-page';

export const NOTAS_ROUTES: Routes = [
  { path: '', component: NotasPage },
  { path: ':id', component: NotaPage },
];
