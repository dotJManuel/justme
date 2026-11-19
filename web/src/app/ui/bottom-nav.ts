import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, signal, inject, output, untracked, viewChild, viewChildren } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationCancel, NavigationEnd, NavigationError, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { Icon } from '../icons/icon';
import { NAV_AFTER_ADD, NAV_BEFORE_ADD, NavDestination } from './nav.config';

const BUBBLE = 48;
const TRAVEL_MS = 480;

/**
 * Barra flotante de móvil: una píldora oscura sobre el contenido con 4 destinos y el "+" justo al centro (dos destinos a
 * cada lado). Un círculo claro marca el destino activo y, al cambiar de uno a otro, viaja bajo los íconos estirándose como
 * una gota y se asienta con un pequeño rebote. Perfil no va aquí: en móvil se abre con el botón de usuario de la barra
 * superior. En escritorio la reemplaza la barra lateral.
 */
@Component({
  selector: 'ui-bottom-nav',
  imports: [RouterLink, Icon],
  template: `
    <nav #nav aria-label="Principal">
      <span #drop class="drop" aria-hidden="true"></span>
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
    </nav>
  `,
  styles: `
    :host {
      position: fixed; z-index: 40; left: 0; right: 0; bottom: calc(12px + var(--safe-b)); display: flex; justify-content: center;
      padding: 0 max(16px, env(safe-area-inset-right, 0px)) 0 max(16px, env(safe-area-inset-left, 0px)); pointer-events: none;
    }
    @media (min-width: 1024px) { :host { display: none; } }
    nav {
      position: relative; pointer-events: auto; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); align-items: center; width: 100%; max-width: 400px;
      height: 64px; padding: 0 6px; border-radius: 32px; background: var(--pill); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28), inset 0 0 0 1px rgba(255, 255, 255, 0.06);
    }
    /* La gota: un círculo claro que se desliza bajo los íconos (posición y animación las pone el componente). */
    .drop {
      position: absolute; top: 8px; left: 0; width: 48px; height: 48px; border-radius: 50%; background: var(--pill-on);
      opacity: 0; transition: opacity 0.2s; will-change: transform; pointer-events: none;
    }
    a {
      position: relative; z-index: 1; display: grid; place-items: center; justify-self: center; width: 48px; height: 48px; border-radius: 50%;
      color: var(--pill-tx); text-decoration: none; -webkit-tap-highlight-color: transparent; transition: color 0.2s 0.1s, transform 0.1s;
    }
    a:active { transform: scale(0.92); }
    a.on { color: var(--pill-on-tx); }
    .mid { position: relative; z-index: 1; display: flex; justify-content: center; }
    .add {
      display: grid; place-items: center; width: 52px; height: 52px; border: 0; border-radius: 50%;
      background: var(--orf); color: var(--ink); cursor: pointer; transition: transform 0.1s, filter 0.15s;
    }
    .add:hover { filter: brightness(1.06); }
    .add:active { transform: scale(0.94); }
    /* El foco del teclado se ve sobre el fondo oscuro de la píldora */
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
  private readonly drop = viewChild.required<ElementRef<HTMLElement>>('drop');
  private readonly links = viewChildren<ElementRef<HTMLElement>>('lnk');
  private readonly items = [...this.before, ...this.after];

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** Destino tocado cuya pantalla aún está cargando: la gota ya se mueve hacia él, sin esperar a que termine la navegación. */
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

  /** Dónde está la gota ahora (null si aún no se colocó). */
  private x: number | null = null;

  constructor() {
    // Al terminar (o fallar o cancelarse) la navegación, manda la ruta real.
    const done = this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd || e instanceof NavigationCancel || e instanceof NavigationError))
      .subscribe(() => this.pending.set(null));
    inject(DestroyRef).onDestroy(() => done.unsubscribe());

    effect(() => {
      const i = this.active();
      this.links(); // vuelve a correr cuando ya existen los enlaces
      untracked(() => this.moveTo(i, true));
    });

    // Si cambia el ancho (girar el teléfono, otra ventana), la gota se recoloca sin animar.
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => this.moveTo(this.active(), false));
      effect(() => ro.observe(this.nav().nativeElement));
      inject(DestroyRef).onDestroy(() => ro.disconnect());
    }
  }

  private moveTo(index: number, animate: boolean) {
    const drop = this.drop().nativeElement;
    const link = index >= 0 ? this.links()[index]?.nativeElement : undefined;
    if (!link || !link.offsetWidth) {
      drop.style.opacity = '0'; // sin destino activo (Perfil): la gota se desvanece donde está
      return;
    }
    const to = link.offsetLeft + (link.offsetWidth - BUBBLE) / 2;
    const from = this.x;
    this.x = to;
    drop.style.opacity = '1';
    if (from === null || from === to || !animate || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      drop.getAnimations().forEach((a) => a.cancel());
      drop.style.transform = `translateX(${to}px)`;
      return;
    }
    // Estiramiento según la distancia: la gota se alarga al arrancar, se aplasta al llegar y rebota hasta asentarse.
    const d = to - from;
    const stretch = 1 + Math.min(Math.abs(d) / 110, 0.9);
    const at = (t: number) => `translateX(${from + d * t}px)`;
    drop.getAnimations().forEach((a) => a.cancel());
    drop.style.transform = `translateX(${to}px)`;
    drop.animate(
      [
        { transform: `${at(0)} scale(1, 1)`, offset: 0, easing: 'cubic-bezier(0.4, 0, 0.6, 1)' },
        { transform: `${at(0.5)} scale(${stretch}, ${1 / Math.sqrt(stretch)})`, offset: 0.4, easing: 'cubic-bezier(0.3, 0, 0.3, 1)' },
        { transform: `${at(1)} scale(${1 - (stretch - 1) * 0.18}, ${1 + (stretch - 1) * 0.22})`, offset: 0.72, easing: 'ease-out' },
        { transform: `${at(1)} scale(1.04, 0.97)`, offset: 0.88, easing: 'ease-out' },
        { transform: `${at(1)} scale(1, 1)`, offset: 1 },
      ],
      { duration: TRAVEL_MS },
    );
  }
}
