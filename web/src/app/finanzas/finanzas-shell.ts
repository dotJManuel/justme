import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Icon } from '../icons/icon';
import { Button } from '../ui/button';
import { ErrorState, Skeleton } from '../ui/states';
import { FinanzasView } from './finanzas-view';
import { FinanzasService } from './finanzas.service';

/**
 * Marco de Finanzas: título, mes, búsqueda, "Exportar" y las cuatro secciones (Resumen · Tarjetas · Por cobrar ·
 * Familia). En escritorio las secciones están en la barra lateral y aquí no se repiten.
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

  protected onSearch(e: Event) {
    this.view.query.set((e.target as HTMLInputElement).value);
  }
}
