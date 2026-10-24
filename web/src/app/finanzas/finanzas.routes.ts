import { Routes } from '@angular/router';
import { FinanzasPage } from './finanzas-page';
import { FinanzasAdminPage } from './admin/finanzas-admin-page';
import { GastosPage } from './gastos/gastos-page';
import { PendientePage } from './pendiente/pendiente-page';

export const FINANZAS_ROUTES: Routes = [
  {
    path: '',
    component: FinanzasPage,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'gastos' },
      { path: 'gastos', component: GastosPage },
      { path: 'pendiente', component: PendientePage },
      { path: 'admin', component: FinanzasAdminPage },
    ],
  },
];
