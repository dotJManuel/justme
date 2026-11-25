import { Routes } from '@angular/router';
import { NotaPage } from './nota-page';
import { NotasPage } from './notas-page';
import { NotasShell } from './notas-shell';

export const NOTAS_ROUTES: Routes = [
  {
    path: '',
    component: NotasShell,
    children: [
      { path: '', component: NotasPage },
      { path: ':id', component: NotaPage },
    ],
  },
];
