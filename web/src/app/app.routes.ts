import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './auth.guard';
import { HabitsPage } from './habits/habits-page';
import { Login } from './login/login';

export const routes: Routes = [
  { path: 'login', component: Login, canActivate: [guestGuard] },
  { path: '', component: HabitsPage, canActivate: [authGuard] },
  { path: '**', redirectTo: '' },
];
