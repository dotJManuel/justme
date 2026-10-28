import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { ToastService } from '../ui/toast';

/** Cada cuánto, con la app abierta, se busca una versión nueva. */
const CHECK_EVERY_MS = 30 * 60 * 1000;

/**
 * Lo propio de ser una app instalada: avisa cuando hay una versión nueva ("Actualizar") y si el dispositivo se
 * quedó sin conexión. Los datos nunca se guardan en el dispositivo: solo la app (pantallas y estilos).
 */
@Injectable({ providedIn: 'root' })
export class PwaService {
  private readonly updates = inject(SwUpdate);
  private readonly toasts = inject(ToastService);

  /** ¿Hay conexión? */
  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);

  constructor() {
    const destroy = inject(DestroyRef);
    const on = () => this.online.set(true);
    const off = () => this.online.set(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    destroy.onDestroy(() => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    });

    if (!this.updates.isEnabled) return; // en desarrollo no hay service worker

    const sub = this.updates.versionUpdates.subscribe((e) => {
      if (e.type !== 'VERSION_READY') return;
      this.toasts.show({
        message: 'Hay una versión nueva de JustMe',
        actionLabel: 'Actualizar',
        onAction: () => void this.updates.activateUpdate().then(() => document.location.reload()),
        duration: 60_000,
      });
    });
    // Si la copia guardada quedó inservible, lo único sano es recargar.
    const broken = this.updates.unrecoverable.subscribe(() => document.location.reload());

    const check = () => void this.updates.checkForUpdate().catch(() => undefined);
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(check, CHECK_EVERY_MS);
    destroy.onDestroy(() => {
      sub.unsubscribe();
      broken.unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    });
  }
}
