import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Marca de JustMe: una llama (la racha) con un signo de pesos calado (tus finanzas), en el color de acento y sin fondo. Toma los
 * colores del tema, así que se ve bien en claro y en oscuro. Es decorativa: junto a ella va el nombre.
 */
@Component({
  selector: 'ui-logo',
  host: { 'aria-hidden': 'true', '[style.--logo-size]': 'px()' },
  template: `
    <svg viewBox="0 0 96 96" focusable="false">
      <defs>
        <mask id="logo-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="96" height="96">
          <rect width="96" height="96" fill="#fff" />
          <g transform="translate(40 62) scale(1.2) translate(-40 -62)" fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round">
            <path d="M47 55C47 52 44 50 40 50C36 50 33 52 33 55.5C33 59 36 60.5 40 62C44 63.5 47 65 47 69C47 72.5 44 75 40 75C36 75 33 73 33 70" stroke-width="5.5" />
            <path d="M40 45V80" stroke-width="4" />
          </g>
        </mask>
      </defs>
      <g transform="translate(48 50) scale(1.02) translate(-40 -48)">
        <path fill="var(--ac)" mask="url(#logo-mask)" d="M42 4c4 14 22 24 26 44 4 22-10 44-26 44S12 74 16 52c2-12 10-18 12-28 6 6 6 14 6 18 6-8 10-22 8-38z" />
      </g>
    </svg>
  `,
  styles: `
    :host { display: inline-flex; flex: none; width: var(--logo-size, 32px); height: var(--logo-size, 32px); }
    svg { width: 100%; height: 100%; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Logo {
  /** Tamaño en px. */
  readonly size = input(32);
  protected readonly px = computed(() => `${this.size()}px`);
}
