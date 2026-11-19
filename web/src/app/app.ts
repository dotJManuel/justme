import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AddSheet } from './add/add-sheet';
import { AddSheetService } from './add/add-sheet.service';
import { AuthService } from './auth.service';
import { OfflineBanner } from './pwa/offline-banner';
import { Celebration } from './racha/celebration';
import { BottomNav } from './ui/bottom-nav';
import { Sidebar } from './ui/sidebar';
import { TopBar } from './ui/top-bar';
import { ToastHost } from './ui/toast';

/** Marco de la app: barra lateral (escritorio) o inferior (móvil), la pantalla y la hoja "+" de captura. */
@Component({
  imports: [OfflineBanner, RouterOutlet, Sidebar, TopBar, BottomNav, AddSheet, Celebration, ToastHost],
  selector: 'app-root',
  template: `
    @if (auth.session()) {
      <ui-sidebar (add)="adding.show()" />
    }
    <div class="main" [class.nav]="!!auth.session()">
      <app-offline-banner />
      @if (auth.session() && showTop()) {
        <ui-top-bar />
      }
      <router-outlet />
    </div>
    @if (auth.session()) {
      <ui-bottom-nav (add)="adding.show()" />
      <app-add-sheet [(open)]="adding.open" />
      <app-celebration />
    }
    <ui-toast-host />
  `,
  styles: `
    :host { display: flex; align-items: flex-start; min-height: 100dvh; }
    .main { flex: 1; min-width: 0; }
    /* Deja libre la barra inferior fija (y el área segura) en móvil */
    .main.nav { padding-bottom: calc(var(--nav-h) + var(--safe-b)); }
    @media (min-width: 1024px) { .main.nav { padding-bottom: 0; } }
  `,
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly adding = inject(AddSheetService);

  private readonly router = inject(Router);
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  /** La barra superior de móvil va en las pantallas principales; no en Perfil ni dentro de una nota (que traen la suya). */
  protected readonly showTop = computed(() => {
    const path = this.url().split(/[?#]/)[0];
    return !path.startsWith('/perfil') && !path.startsWith('/login') && !/^\/notas\/[^/]+/.test(path);
  });
}
