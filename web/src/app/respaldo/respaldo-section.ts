import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Icon } from '../icons/icon';
import { Button } from '../ui/button';
import { ToastService } from '../ui/toast';
import { RespaldoService, Resumen } from './respaldo.service';

const DAY = 86_400_000;

function size(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Configuración › Respaldo: descarga un ZIP con todo lo tuyo en formatos abiertos y recuerda cuándo fue el último. */
@Component({
  selector: 'app-respaldo',
  imports: [Button, Icon],
  template: `
    <h2 class="sec" id="resp-h">Respaldo</h2>
    <div class="panel" aria-labelledby="resp-h">
      <p class="lead">
        Un solo archivo <b>.zip</b> con todo lo tuyo: finanzas en Excel, rutina y enlaces en CSV, tus notas en Markdown con sus imágenes, y una copia
        completa en <b>datos.json</b>. Se abre sin la app y lo puedes llevar a otra herramienta.
      </p>

      <p class="when" [class.warn]="stale()" role="status">
        <app-icon [name]="stale() ? 'alert' : 'history'" [size]="16" />
        {{ whenText() }}
      </p>

      <button uiBtn block type="button" [disabled]="busy()" (click)="run()">
        <app-icon name="download" [size]="18" />{{ busy() ? 'Preparando el respaldo…' : 'Descargar respaldo completo' }}
      </button>

      @if (busy()) {
        <div class="bar" role="progressbar" aria-label="Avance del respaldo" [attr.aria-valuenow]="pct()" aria-valuemin="0" aria-valuemax="100">
          <span [style.width.%]="pct()"></span>
        </div>
        <p class="step">{{ step() }}</p>
      }

      @if (done(); as r) {
        <p class="ok" role="status">
          <app-icon name="check" [size]="16" [stroke]="2.4" />
          <span>Listo: <b>{{ r.nombre }}</b> ({{ sizeText(r.bytes) }}), {{ contents(r) }}. Guárdalo en tu nube (Drive, OneDrive…).</span>
        </p>
        @if (r.omitidas.length || r.imagenesFallidas) {
          <p class="warnbox" role="alert">
            <app-icon name="alert" [size]="16" />
            <span>
              @if (r.omitidas.length) {
                No se pudo leer: {{ r.omitidas.join(', ') }}.
              }
              @if (r.imagenesFallidas) {
                {{ r.imagenesFallidas }} imagen{{ r.imagenesFallidas === 1 ? '' : 'es' }} no se pudieron descargar.
              }
              El respaldo se entregó con lo demás; vuelve a intentarlo para completarlo.
            </span>
          </p>
        }
      }

      <details>
        <summary>¿Qué incluye el .zip?</summary>
        <ul>
          <li><b>LEEME.txt</b>: qué hay y cómo abrirlo.</li>
          <li><b>datos.json</b>: todo, completo y ordenado (la copia fiel).</li>
          <li><b>finanzas.xlsx</b>: gastos, cortes, lo que te deben y dinero con familia.</li>
          <li><b>rutina/</b>: misiones, días marcados e insignias en CSV.</li>
          <li><b>enlaces.csv</b>: tus enlaces.</li>
          <li><b>notas/</b>: una nota por archivo .md; las subpáginas en carpetas.</li>
          <li><b>imagenes/</b>: las imágenes de tus notas.</li>
        </ul>
      </details>
    </div>
  `,
  styles: `
    :host { display: block; }
    .sec { margin-bottom: 8px; padding: 0 4px; font-size: 13px; line-height: 16px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--tx3); }
    .panel { display: flex; flex-direction: column; gap: 12px; padding: 16px; border-radius: var(--rf-3); background: var(--sf); box-shadow: var(--sh1), inset 0 0 0 1px var(--bd); }
    .lead { font-size: 14px; line-height: 21px; color: var(--tx2); }
    .lead b { color: var(--tx); font-weight: 600; }
    .when { display: flex; align-items: center; gap: 6px; font-size: 13px; line-height: 18px; color: var(--tx2); }
    .when.warn { color: var(--yl); font-weight: 600; }
    .bar { height: 8px; border-radius: 4px; background: var(--s2); overflow: hidden; }
    .bar span { display: block; height: 100%; border-radius: 4px; background: var(--ac); transition: width 0.3s ease; }
    .step { font-size: 13px; color: var(--tx2); }
    .ok { display: flex; align-items: flex-start; gap: 6px; font-size: 13px; line-height: 20px; color: var(--gr); }
    .ok app-icon { margin-top: 2px; }
    .ok span { flex: 1; min-width: 0; }
    .ok b { color: var(--tx); font-weight: 600; word-break: break-all; }
    .warnbox { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; border-radius: var(--rf-2); background: var(--yls); color: var(--yl); font-size: 13px; line-height: 18px; }
    details { font-size: 13px; color: var(--tx2); }
    summary { min-height: 32px; display: flex; align-items: center; color: var(--ac); font-weight: 600; cursor: pointer; }
    ul { margin: 4px 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; line-height: 19px; }
    li b { color: var(--tx); font-weight: 600; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RespaldoSection {
  private readonly svc = inject(RespaldoService);
  private readonly toasts = inject(ToastService);

  protected readonly busy = signal(false);
  protected readonly step = signal('');
  protected readonly pct = signal(0);
  protected readonly done = signal<Resumen | null>(null);

  /** Más de 30 días sin respaldo (o nunca): se avisa. */
  protected readonly stale = computed(() => {
    const t = this.svc.ultimo();
    return t === null || Date.now() - t > 30 * DAY;
  });

  protected readonly whenText = computed(() => {
    const t = this.svc.ultimo();
    if (t === null) return 'Aún no has descargado un respaldo desde este dispositivo.';
    const days = Math.floor((Date.now() - t) / DAY);
    const when = days === 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`;
    return `Último respaldo: ${when}.${days > 30 ? ' Conviene hacer uno nuevo.' : ''}`;
  });

  protected sizeText = size;

  /** «con 8 notas y 1 imagen». */
  protected contents(r: Resumen): string {
    const notas = `${r.notas} nota${r.notas === 1 ? '' : 's'}`;
    return r.imagenes ? `con ${notas} y ${r.imagenes} imagen${r.imagenes === 1 ? '' : 'es'}` : `con ${notas}`;
  }

  protected async run() {
    if (this.busy()) return;
    this.busy.set(true);
    this.done.set(null);
    this.pct.set(0);
    this.step.set('Empezando…');
    try {
      const { blob, resumen } = await this.svc.crear((t, p) => {
        this.step.set(t);
        this.pct.set(Math.round(p));
      });
      this.svc.descargar(blob, resumen.nombre);
      this.done.set(resumen);
    } catch {
      this.toasts.error('No se pudo armar el respaldo. Revisa tu conexión e intenta de nuevo.');
    } finally {
      this.busy.set(false);
    }
  }
}
