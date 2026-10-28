import { TestBed } from '@angular/core/testing';
import { SwUpdate } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ToastService } from '../ui/toast';
import { PwaService } from './pwa.service';

function setup(enabled: boolean) {
  const versionUpdates = new Subject<{ type: string }>();
  const activateUpdate = vi.fn().mockResolvedValue(true);
  TestBed.configureTestingModule({
    providers: [
      {
        provide: SwUpdate,
        useValue: { isEnabled: enabled, versionUpdates, unrecoverable: new Subject(), activateUpdate, checkForUpdate: vi.fn().mockResolvedValue(false) },
      },
    ],
  });
  return { versionUpdates, activateUpdate, toasts: TestBed.inject(ToastService), pwa: TestBed.inject(PwaService) };
}

describe('PwaService', () => {
  it('sigue el estado de la conexión', () => {
    const { pwa } = setup(false);
    window.dispatchEvent(new Event('offline'));
    expect(pwa.online()).toBe(false);
    window.dispatchEvent(new Event('online'));
    expect(pwa.online()).toBe(true);
  });

  it('avisa cuando hay una versión nueva, con la acción de actualizar', () => {
    const { versionUpdates, toasts } = setup(true);
    versionUpdates.next({ type: 'VERSION_DETECTED' });
    expect(toasts.current()).toBeNull();
    versionUpdates.next({ type: 'VERSION_READY' });
    expect(toasts.current()).toMatchObject({ message: 'Hay una versión nueva de JustMe', actionLabel: 'Actualizar' });
  });

  it('sin service worker (desarrollo) no avisa de versiones', () => {
    const { versionUpdates, toasts } = setup(false);
    versionUpdates.next({ type: 'VERSION_READY' });
    expect(toasts.current()).toBeNull();
  });
});
