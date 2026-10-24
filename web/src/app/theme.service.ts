import { Injectable, computed, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const KEY = 'justme-theme';

/**
 * Modo claro u oscuro. Mientras no se elija uno a mano, se usa el del sistema; al elegir, se recuerda en este
 * navegador (index.html lo aplica antes de arrancar para que no parpadee).
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly query = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

  private readonly choice = signal<Theme | null>(this.read());
  private readonly system = signal<Theme>(this.query?.matches ? 'dark' : 'light');

  /** El modo que se está viendo. */
  readonly theme = computed<Theme>(() => this.choice() ?? this.system());

  constructor() {
    this.query?.addEventListener('change', (e) => this.system.set(e.matches ? 'dark' : 'light'));
  }

  toggle() {
    const next: Theme = this.theme() === 'dark' ? 'light' : 'dark';
    this.choice.set(next);
    document.documentElement.dataset['theme'] = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Sin almacenamiento (modo privado): el cambio vale solo mientras la página siga abierta.
    }
  }

  private read(): Theme | null {
    try {
      const saved = localStorage.getItem(KEY);
      return saved === 'light' || saved === 'dark' ? saved : null;
    } catch {
      return null;
    }
  }
}
