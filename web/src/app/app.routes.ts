import { Routes } from '@angular/router';
import { AdminPage } from './admin/admin-page';
import { authGuard, guestGuard } from './auth.guard';
import { HabitsPage } from './habits/habits-page';
import { Login } from './login/login';

export const routes: Routes = [
  { path: 'login', component: Login, canActivate: [guestGuard] },
  { path: 'admin', component: AdminPage, canActivate: [authGuard] },
  {
    path: 'finanzas',
    canActivate: [authGuard],
    loadChildren: () => import('./finanzas/finanzas.routes').then((m) => m.FINANZAS_ROUTES),
  },
  { path: '', component: HabitsPage, canActivate: [authGuard] },
  { path: '**', redirectTo: '' },
];
