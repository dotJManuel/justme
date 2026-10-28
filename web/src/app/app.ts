import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AddSheet } from './add/add-sheet';
import { AddSheetService } from './add/add-sheet.service';
import { AuthService } from './auth.service';
import { Celebration } from './racha/celebration';
import { BottomNav } from './ui/bottom-nav';
import { Sidebar } from './ui/sidebar';
import { ToastHost } from './ui/toast';

/** Marco de la app: barra lateral (escritorio) o inferior (móvil), la pantalla y la hoja "+" de captura. */
@Component({
  imports: [RouterOutlet, Sidebar, BottomNav, AddSheet, Celebration, ToastHost],
  selector: 'app-root',
  template: `
    @if (auth.session()) {
      <ui-sidebar (add)="adding.show()" />
    }
    <div class="main" [class.nav]="!!auth.session()">
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
}
