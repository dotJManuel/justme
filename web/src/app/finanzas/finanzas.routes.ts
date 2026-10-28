import { Routes } from '@angular/router';
import { FamiliaPage } from './familia/familia-page';
import { FinanzasShell } from './finanzas-shell';
import { PersonaPage } from './por-cobrar/persona-page';
import { PorCobrarPage } from './por-cobrar/por-cobrar-page';
import { ResumenPage } from './resumen/resumen-page';
import { TarjetasPage } from './tarjetas/tarjetas-page';

export const FINANZAS_ROUTES: Routes = [
  {
    path: '',
    component: FinanzasShell,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'resumen' },
      { path: 'resumen', component: ResumenPage },
      { path: 'tarjetas', component: TarjetasPage },
      { path: 'por-cobrar', component: PorCobrarPage },
      { path: 'por-cobrar/:id', component: PersonaPage },
      { path: 'familia', component: FamiliaPage },
    ],
  },
  // Rutas de la navegación anterior
  { path: 'gastos', redirectTo: 'resumen' },
  { path: 'pendiente', redirectTo: 'por-cobrar' },
  { path: 'historial', redirectTo: '/perfil/historial' },
  { path: 'admin', redirectTo: '/perfil/catalogos' },
];
