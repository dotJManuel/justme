import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, output, signal, untracked, viewChild, viewChildren } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationCancel, NavigationEnd, NavigationError, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { Icon } from '../icons/icon';
import { NAV_AFTER_ADD, NAV_BEFORE_ADD, NavDestination } from './nav.config';

// Geometría (px). La barra es un rectángulo de esquinas redondas; su borde superior forma un valle suave en forma de S
// bajo el destino activo y el círculo descansa dentro con una holgura pareja (~9 px) alrededor.
const H = 62; // alto de la barra
const R = 22; // radio de las esquinas
const HW = 44; // medio ancho del valle (donde empieza a bajar el borde)
const K1 = 26; // suavidad del hombro (qué tan gradual baja el borde)
const K2 = 44; // ancho del fondo plano del valle
const DEPTH = 48; // profundidad del valle
const BUBBLE = 42; // diámetro del círculo
const EDGE = R + HW; // el centro del valle nunca se acerca más que esto a los extremos
const TRAVEL_MS = 520;

/** Camino de la barra con el valle centrado en `cx` (sin `cx`: barra lisa). */
function barPath(w: number, cx: number | null): string {
  const top =
    cx === null
      ? `H ${w - R}`
      : `H ${cx - HW} C ${cx - HW + K1} 0 ${cx - K2} ${DEPTH} ${cx} ${DEPTH} C ${cx + K2} ${DEPTH} ${cx + HW - K1} 0 ${cx + HW} 0 H ${w - R}`;
  return `M ${R} 0 ${top} A ${R} ${R} 0 0 1 ${w} ${R} V ${H - R} A ${R} ${R} 0 0 1 ${w - R} ${H} H ${R} A ${R} ${R} 0 0 1 0 ${H - R} V ${R} A ${R} ${R} 0 0 1 ${R} 0 Z`;
}

/** Salida con un ligero rebote al final. */
const easeOutBack = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;

/**
 * Barra flotante de móvil: un rectángulo oscuro de esquinas redondas sobre el contenido, con 4 destinos y el "+" justo al
 * centro (dos destinos a cada lado). Bajo el destino activo el borde superior forma un valle suave y en él descansa un
 * círculo con el ícono, que sube. Al cambiar de destino, el valle y el círculo se deslizan juntos con un pequeño rebote.
 * Perfil no va aquí: en móvil se abre con el botón de la barra superior. En escritorio la reemplaza la barra lateral.
 */
@Component({
  selector: 'ui-bottom-nav',
  imports: [RouterLink, Icon],
  template: `
    <nav #nav aria-label="Principal" [class.none]="active() < 0">
      <svg #svg class="bg" aria-hidden="true" focusable="false"><path #path /></svg>
      <span #bubble class="bubble" aria-hidden="true"></span>
      <div class="row">
        @for (d of before; track d.path; let i = $index) {
          <a #lnk [routerLink]="d.path" [class.on]="active() === i" [attr.aria-current]="active() === i ? 'page' : null" (click)="pending.set(i)">
            <app-icon [name]="d.icon" [size]="22" /><span class="sr-only">{{ d.label }}</span>
          </a>
        }
        <span class="mid"><button type="button" class="add" aria-label="Agregar" (click)="add.emit()"><app-icon name="plus" [size]="24" [stroke]="2.4" /></button></span>
        @for (d of after; track d.path; let i = $index) {
          <a #lnk [routerLink]="d.path" [class.on]="active() === before.length + i" [attr.aria-current]="active() === before.length + i ? 'page' : null" (click)="pending.set(before.length + i)">
            <app-icon [name]="d.icon" [size]="22" /><span class="sr-only">{{ d.label }}</span>
          </a>
        }
      </div>
    </nav>
  `,
  styles: `
    :host {
      position: fixed; z-index: 40; left: 0; right: 0; bottom: calc(12px + var(--safe-b)); display: flex; justify-content: center;
      padding: 0 max(16px, env(safe-area-inset-right, 0px)) 0 max(16px, env(safe-area-inset-left, 0px)); pointer-events: none;
    }
    @media (min-width: 1024px) { :host { display: none; } }
    nav {
      position: relative; pointer-events: auto; width: 100%; max-width: 400px; height: 62px;
    }
    .bg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
    .bg path { fill: var(--pill); }
    /* El círculo que descansa en el valle: lleva el ícono activo. */
    .bubble {
      position: absolute; top: -4px; left: 0; width: 42px; height: 42px; border-radius: 50%; background: var(--pill);
      will-change: transform; transition: opacity 0.2s; pointer-events: none;
    }
    nav.none .bubble { opacity: 0; }
    /* Los destinos se reparten en columnas iguales. El margen lateral deja ~14 px entre el valle del destino activo de un extremo y
       su vecino (sin bajar de ~40 px entre íconos en pantallas muy angostas). */
    .row {
      position: absolute; inset: 0; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); align-items: center;
      padding: 4px max(10px, min(calc(292.5px - 75%), calc(50% - 100px))) 0;
    }
    a {
      position: relative; display: grid; place-items: center; justify-self: center; width: 44px; height: 44px; border-radius: 50%;
      color: var(--pill-on); text-decoration: none; -webkit-tap-highlight-color: transparent;
      transition: transform 0.38s cubic-bezier(0.34, 1.5, 0.5, 1) 0.12s;
    }
    /* El ícono activo sube al círculo (con un pequeño retraso, cuando llega); en los extremos también se corre hacia dentro (--dx). */
    a.on { transform: translate(var(--dx, 0px), -16px); }
    .mid { display: flex; justify-content: center; }
    .add {
      display: grid; place-items: center; width: 46px; height: 46px; border: 0; border-radius: 50%;
      background: var(--orf); color: var(--ink); cursor: pointer; transition: transform 0.1s, filter 0.15s;
    }
    .add:hover { filter: brightness(1.06); }
    .add:active { transform: scale(0.94); }
    /* El foco del teclado se ve sobre el fondo oscuro de la barra */
    a:focus-visible, .add:focus-visible { box-shadow: 0 0 0 2px var(--pill), 0 0 0 4px var(--pill-on); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BottomNav {
  protected readonly before = NAV_BEFORE_ADD;
  /** Solo los destinos que van en móvil (Perfil queda fuera). */
  protected readonly after: NavDestination[] = NAV_AFTER_ADD.filter((d) => !d.desktopOnly);
  readonly add = output<void>();

  private readonly router = inject(Router);
  private readonly nav = viewChild.required<ElementRef<HTMLElement>>('nav');
  private readonly svg = viewChild.required<ElementRef<SVGSVGElement>>('svg');
  private readonly path = viewChild.required<ElementRef<SVGPathElement>>('path');
  private readonly bubble = viewChild.required<ElementRef<HTMLElement>>('bubble');
  private readonly links = viewChildren<ElementRef<HTMLElement>>('lnk');
  private readonly items = [...this.before, ...this.after];

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** Destino tocado cuya pantalla aún está cargando: el valle ya se mueve hacia él, sin esperar a que termine la navegación. */
  protected readonly pending = signal<number | null>(null);

  /** Índice del destino activo (-1 si la pantalla no es de la barra, como Perfil). */
  protected readonly active = computed(() => {
    const p = this.pending();
    if (p !== null) return p;
    this.url();
    return this.items.findIndex((d) =>
      this.router.isActive(d.path, { paths: d.exact ? 'exact' : 'subset', queryParams: 'ignored', fragment: 'ignored', matrixParams: 'ignored' }),
    );
  });

  /** Dónde está dibujado el valle ahora (null si no hay: barra lisa). */
  private cx: number | null = null;
  private raf = 0;
  private width = 0;

  constructor() {
    // Al terminar (o fallar o cancelarse) la navegación, manda la ruta real.
    const done = this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd || e instanceof NavigationCancel || e instanceof NavigationError))
      .subscribe(() => this.pending.set(null));
    inject(DestroyRef).onDestroy(() => {
      done.unsubscribe();
      cancelAnimationFrame(this.raf);
    });

    effect(() => {
      const i = this.active();
      this.links(); // vuelve a correr cuando ya existen los enlaces
      untracked(() => this.moveTo(i, true));
    });

    // Si cambia el ancho (girar el teléfono, otra ventana), la barra se redibuja sin animar.
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => this.moveTo(this.active(), false));
      effect(() => ro.observe(this.nav().nativeElement));
      inject(DestroyRef).onDestroy(() => ro.disconnect());
    }
  }

  private moveTo(index: number, animate: boolean) {
    const nav = this.nav().nativeElement;
    const w = nav.offsetWidth;
    if (!w) return;
    const resized = w !== this.width;
    this.width = w;
    this.svg().nativeElement.setAttribute('viewBox', `0 0 ${w} ${H}`);

    const link = index >= 0 ? this.links()[index]?.nativeElement : undefined;
    if (!link || !link.offsetWidth) {
      cancelAnimationFrame(this.raf);
      this.cx = null; // sin destino activo (Perfil): barra lisa; al volver, el valle se coloca directo
      this.draw(null);
      return;
    }
    const center = link.offsetLeft + link.offsetWidth / 2;
    const target = Math.min(Math.max(center, EDGE), w - EDGE);
    // Un destino muy cerca de un extremo: el círculo se queda a la distancia mínima y su ícono se corre hasta él.
    this.links().forEach((l, k) => l.nativeElement.style.setProperty('--dx', k === index ? (target - center) + 'px' : '0px'));
    const from = this.cx;
    cancelAnimationFrame(this.raf);
    if (from === null || from === target || !animate || resized || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.draw(target);
      return;
    }
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - t0) / TRAVEL_MS, 1);
      this.draw(from + (target - from) * easeOutBack(t));
      if (t < 1) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  /** Dibuja la barra con el valle (y el círculo) centrados en `cx`. */
  private draw(cx: number | null) {
    this.cx = cx;
    this.path().nativeElement.setAttribute('d', barPath(this.width, cx));
    if (cx !== null) this.bubble().nativeElement.style.transform = `translateX(${cx - BUBBLE / 2}px)`;
  }
}
