import { Routes } from '@angular/router';
import { NotaPage } from './nota-page';
import { NotasPapelera } from './notas-papelera';
import { NotasPage } from './notas-page';
import { NotasShell } from './notas-shell';

export const NOTAS_ROUTES: Routes = [
  {
    path: '',
    component: NotasShell,
    children: [
      { path: '', component: NotasPage },
      { path: 'papelera', component: NotasPapelera },
      { path: ':id', component: NotaPage },
    ],
  },
];
