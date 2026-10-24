import { Component, HostListener, OnInit, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FinanzasService } from './finanzas.service';

/** Espacio que deja el menú fijo de arriba al llevar una sección al inicio de la pantalla. */
const TOP_OFFSET = 68;

/** Contenedor del módulo: pestañas Gastos / Pendiente, carga de datos y flechas entre secciones. */
@Component({
  selector: 'app-finanzas-page',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './finanzas-page.html',
  styleUrl: './finanzas-page.css',
})
export class FinanzasPage implements OnInit {
  protected readonly fin = inject(FinanzasService);

  protected readonly atTop = signal(true);
  protected readonly atBottom = signal(false);

  ngOnInit() {
    // El mensaje de error ya queda en el servicio.
    this.fin.load().catch(() => undefined);
  }

  /** Salta a la sección anterior (-1) o siguiente (1); sin más secciones, al inicio o al final de la página. */
  protected step(dir: -1 | 1) {
    const tops = [...document.querySelectorAll('[data-section]')].map((el) => el.getBoundingClientRect().top);
    const i = dir === 1 ? tops.findIndex((t) => t > TOP_OFFSET + 4) : tops.filter((t) => t < TOP_OFFSET - 4).length - 1;
    const top = i >= 0 ? window.scrollY + tops[i] - TOP_OFFSET : dir === 1 ? document.documentElement.scrollHeight : 0;
    window.scrollTo({ top, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  @HostListener('window:scroll')
  @HostListener('window:resize')
  protected onScroll() {
    const doc = document.documentElement;
    this.atTop.set(window.scrollY < 8);
    this.atBottom.set(window.scrollY + window.innerHeight >= doc.scrollHeight - 8);
  }
}
