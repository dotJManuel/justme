import { Injectable, computed, effect, signal } from '@angular/core';

export type Theme = 'light' | 'dark';
/** Lo que elige la persona: un modo fijo o seguir al sistema. */
export type ThemeMode = Theme | 'auto';

const KEY = 'justme-theme';

/**
 * Modo claro, oscuro o automático. En automático se usa el del sistema; al elegir uno fijo se recuerda en este
 * navegador (index.html lo aplica antes de arrancar para que no parpadee).
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly query = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

  /** Lo elegido; `auto` si nunca se eligió. */
  readonly mode = signal<ThemeMode>(this.read());
  private readonly system = signal<Theme>(this.query?.matches ? 'dark' : 'light');

  /** El modo que se está viendo. */
  readonly theme = computed<Theme>(() => {
    const mode = this.mode();
    return mode === 'auto' ? this.system() : mode;
  });

  constructor() {
    this.query?.addEventListener('change', (e) => this.system.set(e.matches ? 'dark' : 'light'));
  }

  set(mode: ThemeMode) {
    this.mode.set(mode);
    if (mode === 'auto') delete document.documentElement.dataset['theme'];
    else document.documentElement.dataset['theme'] = mode;
    try {
      if (mode === 'auto') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, mode);
    } catch {
      // Sin almacenamiento (modo privado): el cambio vale solo mientras la página siga abierta.
    }
  }

  toggle() {
    this.set(this.theme() === 'dark' ? 'light' : 'dark');
  }

  private read(): ThemeMode {
    try {
      const saved = localStorage.getItem(KEY);
      return saved === 'light' || saved === 'dark' ? saved : 'auto';
    } catch {
      return 'auto';
    }
  }
}
