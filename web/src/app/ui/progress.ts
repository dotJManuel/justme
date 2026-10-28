import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type ProgressTone = 'accent' | 'orange' | 'green' | 'red';

/**
 * Barra de progreso. Con `segments` se dibuja en tramos (6 misiones, pago 5 de 9 de un MSI): `value` es
 * cuántos tramos están llenos. Sin él, `value` va de 0 a `max`.
 */
@Component({
  selector: 'ui-progress-bar',
  host: {
    role: 'progressbar',
    '[attr.aria-label]': 'label()',
    '[attr.aria-valuemin]': '0',
    '[attr.aria-valuemax]': 'segments() || max()',
    '[attr.aria-valuenow]': 'value()',
    '[class]': "'tone-' + tone()",
    '[style.--h.px]': 'height()',
  },
  template: `
    @if (segments() > 0) {
      @for (s of cells(); track $index) {
        <i class="seg" [class.on]="s"></i>
      }
    } @else {
      <i class="fill" [style.width.%]="pct()"></i>
    }
  `,
  styles: `
    :host { display: flex; gap: 4px; height: var(--h, 8px); border-radius: var(--rr-pill); background: var(--s2); overflow: hidden; --fill: var(--ac); }
    :host(.tone-orange) { --fill: var(--orf); }
    :host(.tone-green) { --fill: var(--grf); }
    :host(.tone-red) { --fill: var(--rd); }
    .fill { display: block; height: 100%; border-radius: var(--rr-pill); background: var(--fill); transition: width 0.35s ease; }
    .seg { flex: 1; border-radius: var(--rr-pill); background: var(--s3); transition: background-color 0.2s; }
    .seg.on { background: var(--fill); }
    :host:has(.seg) { background: transparent; overflow: visible; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgressBar {
  readonly value = input(0);
  readonly max = input(100);
  readonly segments = input(0);
  readonly tone = input<ProgressTone>('accent');
  readonly height = input(8);
  readonly label = input.required<string>();

  protected readonly pct = computed(() => Math.max(0, Math.min(100, (this.value() / (this.max() || 1)) * 100)));
  protected readonly cells = computed(() => Array.from({ length: this.segments() }, (_, i) => i < this.value()));
}

/** Anillo de progreso con el contenido (X/6, nivel…) al centro. */
@Component({
  selector: 'ui-progress-ring',
  host: {
    role: 'progressbar',
    '[attr.aria-label]': 'label()',
    '[attr.aria-valuemin]': '0',
    '[attr.aria-valuemax]': 'max()',
    '[attr.aria-valuenow]': 'value()',
    '[class]': "'tone-' + tone()",
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
  },
  template: `
    <svg [attr.viewBox]="'0 0 ' + size() + ' ' + size()" aria-hidden="true">
      <circle class="track" [attr.cx]="size() / 2" [attr.cy]="size() / 2" [attr.r]="r()" [attr.stroke-width]="stroke()" fill="none" />
      <circle
        class="arc" [attr.cx]="size() / 2" [attr.cy]="size() / 2" [attr.r]="r()" [attr.stroke-width]="stroke()" fill="none"
        stroke-linecap="round" [attr.stroke-dasharray]="circ()" [attr.stroke-dashoffset]="circ() * (1 - pct())"
        [attr.transform]="'rotate(-90 ' + size() / 2 + ' ' + size() / 2 + ')'"
      />
    </svg>
    <div class="mid"><ng-content /></div>
  `,
  styles: `
    :host { position: relative; display: inline-block; flex: none; --fill: var(--ac); }
    :host(.tone-orange) { --fill: var(--orf); }
    :host(.tone-green) { --fill: var(--grf); }
    svg { display: block; width: 100%; height: 100%; }
    .track { stroke: var(--s3); }
    .arc { stroke: var(--fill); transition: stroke-dashoffset 0.4s ease; }
    .mid { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgressRing {
  readonly value = input(0);
  readonly max = input(100);
  readonly size = input(96);
  readonly stroke = input(10);
  readonly tone = input<ProgressTone>('orange');
  readonly label = input.required<string>();

  protected readonly r = computed(() => (this.size() - this.stroke()) / 2);
  protected readonly circ = computed(() => 2 * Math.PI * this.r());
  protected readonly pct = computed(() => Math.max(0, Math.min(1, this.value() / (this.max() || 1))));
}
