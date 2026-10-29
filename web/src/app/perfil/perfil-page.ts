import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { EditIncome } from '../finanzas/edit/edit-simple';
import { exportTodo } from '../finanzas/export-gastos';
import { FinanzasService } from '../finanzas/finanzas.service';
import { Icon, IconName } from '../icons/icon';
import { ThemeMode, ThemeService } from '../theme.service';
import { Button } from '../ui/button';
import { money } from '../ui/money';
import { Segmented } from '../ui/segmented';
import { ToastService } from '../ui/toast';

interface Entry {
  icon: IconName;
  title: string;
  sub: string;
  link: string;
}

/** Perfil: ingreso mensual, tema y accesos a lo que se configura una vez (misiones, catálogos, historial). */
@Component({
  selector: 'app-perfil-page',
  imports: [Button, EditIncome, Icon, RouterLink, Segmented],
  template: `
    <div class="page">
      <header>
        <h1>Perfil</h1>
        @if (auth.user()?.email; as mail) {
          <span class="mail">{{ mail }}</span>
        }
      </header>

      <section>
        <h2 class="sec">Finanzas</h2>
        <div class="panel">
          <button type="button" class="row" (click)="incomeOpen.set(true)" [disabled]="!fin.loaded() && !loadFailed()" aria-label="Editar ingreso mensual">
            <span class="ico"><app-icon name="wallet" [size]="18" /></span>
            <span class="lt"><span class="ln">Ingreso mensual</span><span class="ls">De aquí sale cuánto te sobra</span></span>
            <span class="la num">{{ fin.loaded() ? money(fin.income()) : '—' }}</span>
            <app-icon class="chev" name="chevron-right" [size]="16" />
          </button>
        </div>
      </section>

      <section>
        <h2 class="sec">Tema</h2>
        <ui-segmented label="Tema" [options]="themes" [value]="theme.mode()" (valueChange)="theme.set($any($event))" />
      </section>

      <section>
        <h2 class="sec">Configuración</h2>
        <div class="panel">
          @for (e of entries; track e.link) {
            <a class="row" [routerLink]="e.link">
              <span class="ico"><app-icon [name]="e.icon" [size]="18" /></span>
              <span class="lt"><span class="ln">{{ e.title }}</span><span class="ls">{{ e.sub }}</span></span>
              <app-icon class="chev" name="chevron-right" [size]="16" />
            </a>
          }
        </div>
      </section>

      <section>
        <h2 class="sec">Enlaces</h2>
        <div class="panel">
          @for (l of links; track l.url) {
            <a class="row" [href]="l.url" target="_blank" rel="noopener noreferrer">
              <span class="ico"><app-icon [name]="l.icon" [size]="18" /></span>
              <span class="lt"><span class="ln">{{ l.title }}</span><span class="ls">{{ l.sub }}</span></span>
              <app-icon class="chev" name="external" [size]="16" />
            </a>
          }
        </div>
      </section>

      <section class="acts">
        <button uiBtn variant="secondary" block type="button" [disabled]="!fin.loaded()" (click)="exportAll()"><app-icon name="download" [size]="18" />Exportar todo a Excel</button>
        <button uiBtn variant="ghost" block type="button" (click)="signOut()"><app-icon name="logout" [size]="18" />Cerrar sesión</button>
      </section>
    </div>

    <app-edit-income [(open)]="incomeOpen" />
  `,
  styles: `
    :host { display: block; }
    .page { display: flex; flex-direction: column; gap: var(--sp-5); max-width: 640px; margin: 0 auto; padding: var(--sp-5) var(--sp-4) var(--sp-6); }
    header { display: flex; flex-direction: column; gap: 2px; }
    h1 { font-size: 28px; line-height: 36px; font-weight: 700; letter-spacing: -0.02em; }
    .mail { font-size: 13px; color: var(--tx2); }
    .sec { margin-bottom: 8px; padding: 0 4px; font-size: 13px; line-height: 16px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--tx3); }
    .panel { display: flex; flex-direction: column; border-radius: var(--rf-3); background: var(--sf); box-shadow: var(--sh1), inset 0 0 0 1px var(--bd); overflow: hidden; }
    .row { position: relative; display: flex; align-items: center; gap: 12px; width: 100%; min-height: 56px; padding: 10px 16px; border: 0; background: none; color: inherit; font: inherit; text-align: left; text-decoration: none; cursor: pointer; }
    .row:hover { background: var(--s2); }
    .row + .row::before { content: ''; position: absolute; top: 0; right: 0; left: 68px; height: 1px; background: var(--bd); }
    .ico { display: grid; place-items: center; flex: none; width: 36px; height: 36px; border-radius: 8px; background: var(--s2); color: var(--tx2); }
    .lt { display: flex; flex-direction: column; flex: 1; min-width: 0; }
    .ln { font-size: 15px; line-height: 20px; font-weight: 600; }
    .ls { font-size: 13px; line-height: 18px; color: var(--tx2); }
    .la { font-size: 15px; font-weight: 600; }
    .chev { color: var(--tx3); }
    .acts { display: flex; flex-direction: column; gap: 8px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PerfilPage implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly fin = inject(FinanzasService);
  protected readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  protected readonly money = money;
  protected readonly incomeOpen = signal(false);
  protected readonly loadFailed = signal(false);

  protected readonly themes: { value: ThemeMode; label: string }[] = [
    { value: 'light', label: 'Claro' },
    { value: 'dark', label: 'Oscuro' },
    { value: 'auto', label: 'Auto' },
  ];
  protected readonly entries: Entry[] = [
    { icon: 'flame', title: 'Misiones y meta diaria', sub: 'Lista, horarios, días de descanso y congelación', link: '/perfil/misiones' },
    { icon: 'sliders', title: 'Catálogos', sub: 'Tarjetas, conceptos y personas', link: '/perfil/catalogos' },
    { icon: 'history', title: 'Historial de cambios', sub: 'Lo que se agregó, editó o eliminó', link: '/perfil/historial' },
  ];

  protected readonly links: { icon: IconName; title: string; sub: string; url: string }[] = [
    { icon: 'languages', title: 'Prep de entrevistas', sub: 'Preguntas y respuestas para repasar', url: 'https://interview-prepjm.netlify.app/' },
  ];

  ngOnInit() {
    this.fin.load().catch(() => this.loadFailed.set(true));
  }

  protected exportAll() {
    exportTodo(this.fin);
    this.toasts.show({ message: 'Descargando el libro de Excel' });
  }

  protected async signOut() {
    await this.auth.signOut();
    await this.router.navigate(['/login']);
  }
}
