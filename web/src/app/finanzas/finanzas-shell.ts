import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Icon } from '../icons/icon';
import { Button } from '../ui/button';
import { ErrorState, Skeleton } from '../ui/states';
import { FinanzasView } from './finanzas-view';
import { FinanzasService } from './finanzas.service';

/** Las pestañas, en orden: deslizar a los lados en el celular pasa de una a la siguiente. */
const TABS = ['resumen', 'tarjetas', 'por-cobrar', 'familia'];
/** Cuánto hay que deslizar (px) y qué tan horizontal debe ser el gesto para contar como cambio de pestaña. */
const SWIPE_MIN = 70;
const SWIPE_RATIO = 1.8;

/**
 * Marco de Finanzas: título, mes, búsqueda, "Exportar" y las cuatro secciones como pestañas (Resumen · Tarjetas ·
 * Por cobrar · Familia), iguales en móvil y escritorio.
 */
@Component({
  selector: 'app-finanzas-shell',
  imports: [Button, ErrorState, Icon, RouterLink, RouterLinkActive, RouterOutlet, Skeleton],
  templateUrl: './finanzas-shell.html',
  styleUrl: './finanzas-shell.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FinanzasShell implements OnInit {
  protected readonly fin = inject(FinanzasService);
  protected readonly view = inject(FinanzasView);
  protected readonly failed = signal(false);
  private readonly router = inject(Router);
  private start: { x: number; y: number } | null = null;

  constructor() {
    // Lo buscado y el mes elegido no se arrastran a otra visita.
    inject(DestroyRef).onDestroy(() => {
      this.view.clearSearch();
      this.view.exporter.set(null);
    });
  }

  ngOnInit() {
    this.load();
  }

  protected load() {
    this.failed.set(false);
    this.fin.load().catch(() => this.failed.set(true));
  }

  // ── Deslizar para cambiar de pestaña (celular)
  protected swipeStart(e: TouchEvent) {
    const t = e.touches[0];
    // Un gesto con dos dedos, dentro de una barra que ya se desplaza de lado o sobre una ventana abierta no cuenta.
    this.start = e.touches.length === 1 && t && !this.scrollsSideways(e.target) && !document.querySelector('dialog[open]') ? { x: t.clientX, y: t.clientY } : null;
  }

  protected swipeEnd(e: TouchEvent) {
    const s = this.start;
    this.start = null;
    const t = e.changedTouches[0];
    if (!s || !t) return;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return;
    // La ficha de una persona es un detalle, no una pestaña: ahí no se desliza.
    const [, , tab, detail] = this.router.url.split('?')[0].split('/');
    const i = TABS.indexOf(tab);
    if (i < 0 || detail) return;
    const next = TABS[i + (dx < 0 ? 1 : -1)];
    if (next) void this.router.navigate(['/finanzas', next]);
  }

  /** ¿El gesto empezó en algo que se desplaza de lado (la barra de pestañas, una tabla ancha)? */
  private scrollsSideways(target: EventTarget | null): boolean {
    for (let el = target as HTMLElement | null; el && el !== document.body; el = el.parentElement) {
      if (el.scrollWidth > el.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowX)) return true;
    }
    return false;
  }

  protected onSearch(e: Event) {
    this.view.query.set((e.target as HTMLInputElement).value);
  }
}
