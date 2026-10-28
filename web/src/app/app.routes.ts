import { isDevMode } from '@angular/core';
import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './auth.guard';
import { HoyPage } from './hoy/hoy-page';
import { Login } from './login/login';

export const routes: Routes = [
  { path: 'login', component: Login, canActivate: [guestGuard] },
  { path: 'admin', redirectTo: 'perfil/misiones' },
  {
    path: 'perfil',
    canActivate: [authGuard],
    loadChildren: () => import('./perfil/perfil.routes').then((m) => m.PERFIL_ROUTES),
  },
  {
    path: 'racha',
    canActivate: [authGuard],
    loadChildren: () => import('./racha/racha.routes').then((m) => m.RACHA_ROUTES),
  },
  {
    path: 'finanzas',
    canActivate: [authGuard],
    loadChildren: () => import('./finanzas/finanzas.routes').then((m) => m.FINANZAS_ROUTES),
  },
  // Solo en desarrollo: catálogo de componentes y datos de ejemplo para ver las pantallas sin sesión.
  ...(isDevMode()
    ? [
        { path: '_ui', loadComponent: () => import('./ui/ui-gallery').then((m) => m.UiGallery) },
        { path: '_demo', loadComponent: () => import('./ui/dev-demo').then((m) => m.DevDemo) },
      ]
    : []),
  { path: '', component: HoyPage, canActivate: [authGuard] },
  { path: '**', redirectTo: '' },
];
