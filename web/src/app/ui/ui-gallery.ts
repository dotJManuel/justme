import { Component, inject, signal } from '@angular/core';
import { Icon } from '../icons/icon';
import { ThemeService } from '../theme.service';
import { BottomNav } from './bottom-nav';
import { BottomSheet } from './bottom-sheet';
import { Button } from './button';
import { Card } from './card';
import { Chip } from './chip';
import { ConfirmDialog } from './confirm-dialog';
import { Input } from './input';
import { ListRow } from './list-row';
import { ProgressBar, ProgressRing } from './progress';
import { Segmented } from './segmented';
import { Sidebar } from './sidebar';
import { EmptyState, ErrorState, Skeleton } from './states';
import { ToastService } from './toast';

/** Catálogo de componentes en claro y oscuro. Solo existe en desarrollo (ruta /_ui). */
@Component({
  selector: 'app-ui-gallery',
  imports: [BottomNav, BottomSheet, Button, Card, Chip, ConfirmDialog, EmptyState, ErrorState, Icon, Input, ListRow, ProgressBar, ProgressRing, Segmented, Sidebar, Skeleton],
  template: `
    <main>
      <header class="head">
        <h1>Componentes base</h1>
        <ui-segmented label="Tema de la página" [options]="modes" [value]="theme.mode()" (valueChange)="theme.set($any($event))" />
      </header>
      <div class="cols">
        @for (t of schemes; track t) {
          <section class="scope" [attr.data-theme]="t">
            <h2>Tema {{ t === 'light' ? 'claro' : 'oscuro' }}</h2>

            <p class="label">Botones</p>
            <div class="wrap">
              <button uiBtn type="button">Guardar gasto</button>
              <button uiBtn variant="secondary" type="button">Secundario</button>
              <button uiBtn variant="ghost" type="button">Fantasma</button>
              <button uiBtn variant="danger" type="button">Eliminar</button>
              <button uiBtn variant="pill" type="button">Completar misión</button>
              <button uiBtn type="button" disabled>Inactivo</button>
            </div>

            <p class="label">Campos</p>
            <div class="two">
              <ui-input label="Monto" inputmode="decimal" [(value)]="amount" />
              <ui-input label="Concepto" placeholder="Ej. Netflix" error="Escribe un concepto para continuar" />
            </div>

            <p class="label">Segmentado y chips</p>
            <ui-segmented label="Sección" [options]="sections" [(value)]="section" />
            <ui-segmented label="Racha" shape="pill" [options]="rachaTabs" [(value)]="rachaTab" />
            <div class="wrap">
              <ui-chip [interactive]="true" [selected]="filter() === 'todo'" (click)="filter.set('todo')">Todo</ui-chip>
              <ui-chip [interactive]="true" [selected]="filter() === 'bbva'" (click)="filter.set('bbva')">BBVA</ui-chip>
              <ui-chip [interactive]="true" [selected]="filter() === 'santander'" (click)="filter.set('santander')">Santander</ui-chip>
              <ui-chip tone="orange"><app-icon name="flame" [size]="14" />2 días</ui-chip>
              <ui-chip tone="green">Hecho</ui-chip>
              <ui-chip tone="red">Vencido</ui-chip>
              <ui-chip tone="yellow">Corte en 3 días</ui-chip>
              <ui-chip tone="accent">Seleccionado</ui-chip>
            </div>

            <p class="label">Listas y tarjetas</p>
            <ui-card [padded]="false">
              <ui-list-row icon="card" title="Netflix" subtitle="Santander · 24 oct" [amount]="-348" [interactive]="true" />
              <ui-list-row icon="users" title="Abono de Ismael" subtitle="Nintendo · 19 oct" [amount]="1000" [interactive]="true" />
              <ui-list-row icon="calendar" title="Santander ·· 0149" subtitle="Corte 12 nov" amountText="En 16 días" tone="neutral" />
            </ui-card>

            <p class="label">Progreso</p>
            <ui-card [padded]="true">
              <div class="prog">
                <ui-progress-ring label="Misiones de hoy" [value]="4" [max]="6"><b class="big">4/6</b></ui-progress-ring>
                <div class="stack">
                  <ui-progress-bar label="Gastado del ingreso" [value]="91" tone="accent" />
                  <ui-progress-bar label="Misiones" [segments]="6" [value]="4" tone="orange" [height]="10" />
                  <ui-progress-bar label="Pago 5 de 9" [segments]="9" [value]="5" [height]="6" />
                </div>
              </div>
            </ui-card>
            <div class="two">
              <ui-card shape="racha" tone="racha">Racha · fondo suave</ui-card>
              <ui-card shape="racha" tone="ok">Misión hecha</ui-card>
            </div>

            <p class="label">Avisos</p>
            <div class="wrap">
              <button uiBtn variant="secondary" type="button" (click)="toastOk()">Mostrar aviso</button>
              <button uiBtn variant="secondary" type="button" (click)="toastErr()">Mostrar error</button>
              <button uiBtn variant="secondary" type="button" (click)="sheet.set(true)">Abrir hoja</button>
              <button uiBtn variant="danger" type="button" (click)="confirm.set(true)">Confirmar borrado</button>
            </div>
            <ui-error-state [inline]="true" message="Sin conexión" />

            <p class="label">Estados</p>
            <ui-card [padded]="false">
              <ui-empty-state icon="wallet" title="Aún no hay gastos" text="Agrega tu primer gasto para ver cómo va tu mes.">
                <button uiBtn type="button" small><app-icon name="plus" [size]="16" />Agregar gasto</button>
              </ui-empty-state>
            </ui-card>
            <ui-card [padded]="true">
              <div class="skel">
                <ui-skeleton width="40%" height="14px" />
                <ui-skeleton height="32px" radius="10px" />
                <ui-skeleton height="8px" radius="999px" />
                <ui-skeleton width="70%" />
              </div>
            </ui-card>
            <ui-card [padded]="false"><ui-error-state message="No se pudieron cargar tus gastos" detail="Revisa tu conexión e intenta de nuevo." /></ui-card>

            <p class="label">Navegación</p>
            <div class="frame bar"><ui-bottom-nav /></div>
            @if (t === 'light') {
              <div class="frame side"><ui-sidebar /></div>
            }
          </section>
        }
      </div>
    </main>

    <ui-bottom-sheet title="Nuevo gasto" [(open)]="sheet">
      <ui-segmented label="Tipo" [options]="kinds" [(value)]="kind" />
      <p class="hint">Contenido de la hoja: en móvil sube desde abajo, en escritorio es un modal.</p>
      <ui-input label="Monto" inputmode="decimal" [(value)]="amount" />
      <div class="actions"><button uiBtn block type="button" (click)="sheet.set(false)">Guardar gasto</button></div>
    </ui-bottom-sheet>

    <ui-confirm-dialog
      [(open)]="confirm"
      title="¿Eliminar la tarjeta Santander?"
      message="Se borrará todo lo que depende de ella."
      [details]="['12 gastos', '3 cortes']"
      alternativeLabel="Solo desactivar"
      confirmLabel="Eliminar todo"
      (confirmed)="confirm.set(false)"
      (alternative)="confirm.set(false)"
    />
  `,
  styles: `
    :host { display: block; background: var(--bg); color: var(--tx); }
    main { max-width: 1280px; margin: 0 auto; padding: var(--sp-5) var(--sp-4) 96px; }
    .head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: var(--sp-5); }
    h1 { font-size: 28px; line-height: 36px; font-weight: 700; letter-spacing: -0.015em; }
    h2 { font-size: 20px; line-height: 28px; font-weight: 600; }
    .head ui-segmented { width: 260px; }
    .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); gap: var(--sp-5); }
    .scope { display: flex; flex-direction: column; gap: 12px; padding: var(--sp-5); border-radius: 16px; background: var(--bg); color: var(--tx); box-shadow: inset 0 0 0 1px var(--bd); min-width: 0; }
    .label { margin-top: 12px; }
    .wrap { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .prog { display: flex; align-items: center; gap: 20px; }
    .stack { display: flex; flex-direction: column; gap: 14px; flex: 1; }
    .big { font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; }
    .skel { display: flex; flex-direction: column; gap: 12px; }
    .hint { font-size: 14px; line-height: 20px; color: var(--tx2); margin: 0 0 12px; }
    .actions { margin-top: 16px; }
    ui-segmented, ui-input { margin-bottom: 0; }
    /* Los elementos fijos de la app se muestran dentro de un marco */
    .frame { border-radius: 16px; overflow: hidden; box-shadow: inset 0 0 0 1px var(--bd); position: relative; }
    .frame.bar { height: 72px; }
    .frame.bar ::ng-deep ui-bottom-nav { display: block; position: absolute; }
    .frame.side { height: 680px; }
    .frame.side ::ng-deep ui-sidebar { display: flex; position: static; height: 100%; }
  `,
})
export class UiGallery {
  protected readonly theme = inject(ThemeService);
  private readonly toasts = inject(ToastService);

  protected readonly schemes = ['light', 'dark'] as const;
  protected readonly modes = [
    { value: 'light', label: 'Claro' },
    { value: 'dark', label: 'Oscuro' },
    { value: 'auto', label: 'Auto' },
  ];
  protected readonly sections = [
    { value: 'resumen', label: 'Resumen' },
    { value: 'tarjetas', label: 'Tarjetas' },
    { value: 'cobrar', label: 'Por cobrar' },
    { value: 'familia', label: 'Familia' },
  ];
  protected readonly rachaTabs = [
    { value: 'hoy', label: 'Hoy' },
    { value: 'logros', label: 'Logros' },
  ];
  protected readonly kinds = [
    { value: 'gasto', label: 'Gasto' },
    { value: 'prestamo', label: 'Préstamo' },
    { value: 'familia', label: 'Familia' },
  ];

  protected readonly amount = signal('610.00');
  protected readonly section = signal('resumen');
  protected readonly rachaTab = signal('hoy');
  protected readonly filter = signal('todo');
  protected readonly kind = signal('gasto');
  protected readonly sheet = signal(false);
  protected readonly confirm = signal(false);

  protected toastOk() {
    this.toasts.show({ message: '+10 XP · Vocabulario de inglés', actionLabel: 'Deshacer' });
  }

  protected toastErr() {
    this.toasts.error('No se pudo guardar', () => undefined);
  }
}
