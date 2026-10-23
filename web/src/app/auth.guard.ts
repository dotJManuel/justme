import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

// inject() solo funciona antes del primer await, por eso se pide todo al inicio.

/** Solo deja pasar con sesión; si no, manda a /login. */
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  return auth.session() ? true : router.createUrlTree(['/login']);
};

/** Si ya hay sesión, /login no tiene sentido: manda al inicio. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  return auth.session() ? router.createUrlTree(['/']) : true;
};
