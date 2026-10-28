import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Icon } from '../icons/icon';
import { Switch } from '../ui/fields';
import { PageHeader } from '../ui/page-header';
import { Segmented } from '../ui/segmented';
import { EmptyState, ErrorState, Skeleton } from '../ui/states';
import { ToastService } from '../ui/toast';
import { Concept, CreditCard, Person } from '../finanzas/finanzas.models';
import { FinanzasService } from '../finanzas/finanzas.service';
import { CatalogItem, CatalogKind, EditCatalog } from './edit-catalog';

interface Row {
  item: CatalogItem;
  name: string;
  sub: string;
}
interface Section {
  key: string;
  title: string;
  help: string;
  kind: CatalogKind;
  scope: string;
  rows: Row[];
}

const TABS = [
  { value: 'tarjetas', label: 'Tarjetas' },
  { value: 'conceptos', label: 'Conceptos' },
  { value: 'personas', label: 'Personas' },
];

const count = (n: number, one: string, many: string) => (n === 0 ? `Sin ${many}` : n === 1 ? `1 ${one}` : `${n} ${many}`);

/**
 * Perfil › Catálogos (lo que antes era Administrar): tarjetas, conceptos y personas. Se activan y desactivan con el
 * interruptor; al tocar una fila se edita o se elimina.
 */
@Component({
  selector: 'app-catalogos-page',
  imports: [EditCatalog, EmptyState, ErrorState, Icon, PageHeader, Segmented, Skeleton, Switch],
  template: `
    <div class="page">
      <ui-page-header title="Catálogos" />
      <ui-segmented label="Catálogo" [options]="tabs" [(value)]="tab" />

      @if (failed()) {
        <ui-error-state message="No se pudieron cargar los catálogos" detail="Revisa tu conexión e intenta de nuevo." (retry)="load()" />
      } @else if (!fin.loaded()) {
        <div class="skel" aria-busy="true" aria-label="Cargando"><ui-skeleton height="200px" radius="12px" /><ui-skeleton height="160px" radius="12px" /></div>
      } @else {
        @if (fin.error()) {
          <ui-error-state [inline]="true" [message]="fin.error()" (retry)="fin.error.set('')" />
        }
        @for (s of sections(); track s.key) {
          <section [attr.aria-labelledby]="'h-' + s.key">
            <div class="sec"><h2 [id]="'h-' + s.key">{{ s.title }}</h2><button type="button" class="add" (click)="edit(s, null)"><app-icon name="plus" [size]="16" />Agregar</button></div>
            <p class="help">{{ s.help }}</p>
            <div class="panel scroll">
              @for (r of s.rows; track r.item.id) {
                <div class="item" [class.off]="!r.item.active">
                  <button type="button" class="txt" (click)="edit(s, r.item)" [attr.aria-label]="'Editar ' + r.name">
                    <span class="ln">{{ r.name }}</span>
                    <span class="ls">{{ r.sub }}</span>
                  </button>
                  <ui-switch [checked]="r.item.active" [label]="(r.item.active ? 'Desactivar ' : 'Activar ') + r.name" (toggled)="toggle(s, r.item, $event)" />
                </div>
              } @empty {
                <ui-empty-state icon="sliders" title="Todavía no hay nada" text="Agrega el primero con el botón de arriba." />
              }
            </div>
          </section>
        }
      }
    </div>

    <app-edit-catalog [kind]="editKind()" [scope]="editScope()" [item]="editing()" [(open)]="editOpen" />
  `,
  styles: `
    :host { display: block; }
    .page { display: flex; flex-direction: column; gap: var(--sp-4); max-width: 640px; margin: 0 auto; padding: var(--sp-5) var(--sp-4) var(--sp-6); }
    .sec { display: flex; justify-content: space-between; align-items: center; padding: 0 4px; }
    h2 { font-size: 13px; line-height: 16px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--tx3); }
    .add { display: flex; align-items: center; gap: 4px; min-height: var(--touch); padding: 0 4px; border: 0; background: none; color: var(--ac); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
    .help { padding: 0 4px 8px; font-size: 13px; line-height: 18px; color: var(--tx2); }
    .panel { display: flex; flex-direction: column; border-radius: var(--rf-3); background: var(--sf); box-shadow: inset 0 0 0 1px var(--bd); overflow: hidden; }
    .scroll { max-height: min(60dvh, 560px); overflow-y: auto; scrollbar-gutter: stable; }
    .item { display: flex; align-items: center; gap: 4px; padding: 0 12px 0 4px; min-height: 56px; }
    .item + .item { border-top: 1px solid var(--bd); }
    .item.off .txt { opacity: 0.55; }
    .txt { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: var(--touch); padding: 6px 12px; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
    .ln { font-size: 15px; line-height: 20px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ls { font-size: 13px; line-height: 18px; color: var(--tx2); }
    .skel { display: flex; flex-direction: column; gap: var(--sp-3); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogosPage implements OnInit {
  protected readonly fin = inject(FinanzasService);
  private readonly toasts = inject(ToastService);

  protected readonly tabs = TABS;
  protected readonly tab = signal('tarjetas');
  protected readonly failed = signal(false);

  protected readonly editing = signal<CatalogItem | null>(null);
  protected readonly editKind = signal<CatalogKind>('card');
  protected readonly editScope = signal('');
  protected readonly editOpen = signal(false);

  ngOnInit() {
    this.load();
  }

  protected load() {
    this.failed.set(false);
    this.fin.load().catch(() => this.failed.set(true));
  }

  private conceptUsage(scope: Concept['scope']): Map<string, number> {
    const ids =
      scope === 'movimiento' ? this.fin.debts().map((d) => d.conceptId) : scope === 'familia' ? this.fin.family().map((m) => m.conceptId) : this.fin.expenses().map((e) => e.conceptId);
    const counts = new Map<string, number>();
    for (const id of ids) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    return counts;
  }

  private conceptSection(scope: Concept['scope'], title: string, help: string): Section {
    const usage = this.conceptUsage(scope);
    const unit = scope === 'gasto' ? ['gasto', 'gastos'] : ['movimiento', 'movimientos'];
    return {
      key: `c-${scope}`, title, help, kind: 'concept', scope,
      rows: this.fin.concepts().filter((c) => c.scope === scope).map((c) => ({ item: c, name: c.name, sub: count(usage.get(c.id) ?? 0, unit[0], unit[1]) })),
    };
  }

  private peopleSection(scope: Person['scope'], title: string, help: string): Section {
    const ids = scope === 'familia' ? this.fin.family().map((m) => m.personId) : this.fin.debts().map((d) => d.personId);
    const usage = new Map<string, number>();
    for (const id of ids) if (id) usage.set(id, (usage.get(id) ?? 0) + 1);
    return {
      key: `p-${scope}`, title, help, kind: 'person', scope,
      rows: this.fin.people().filter((p) => p.scope === scope).map((p) => ({ item: p, name: p.name, sub: count(usage.get(p.id) ?? 0, 'movimiento', 'movimientos') })),
    };
  }

  protected readonly sections = computed<Section[]>(() => {
    const t = this.tab();
    if (t === 'tarjetas') {
      return [
        {
          key: 'cards', title: 'Tarjetas de crédito', kind: 'card', scope: '',
          help: 'Cada tarjeta activa aparece en Finanzas con su corte. Desactivar una tarjeta la oculta y deja de sumar en el resumen, pero conserva su historial. La terminación (últimos 4 dígitos) sirve para registrar solas las compras que avisa el banco por correo.',
          rows: this.fin.cards().map((c: CreditCard) => ({
            item: c,
            name: c.name,
            sub: `Corte el día ${c.cutDay}${c.last4 ? ` · ·· ${c.last4}` : ''} · ${count(this.fin.expenses().filter((e) => e.cardId === c.id).length, 'gasto', 'gastos')}`,
          })),
        },
      ];
    }
    if (t === 'conceptos') {
      return [
        this.conceptSection('gasto', 'Conceptos de gastos', 'Son las opciones del campo Concepto al capturar un gasto. Desactivar un concepto deja de ofrecerlo, pero los gastos que ya lo usan se conservan.'),
        this.conceptSection('movimiento', 'Conceptos de movimientos', 'Son las opciones del campo Concepto de un préstamo o abono. Desactivar un concepto deja de ofrecerlo, pero los movimientos que ya lo usan se conservan.'),
        this.conceptSection('familia', 'Conceptos de familia', 'Son las opciones del campo Concepto en Recibido y Dado. Desactivar un concepto deja de ofrecerlo, pero los registros que ya lo usan se conservan.'),
      ];
    }
    return [
      this.peopleSection('deudor', 'Personas (dinero que me deben)', 'Son las opciones del campo Persona en préstamos y abonos. Una persona desactivada no se ofrece en movimientos nuevos, pero sus movimientos se conservan y lo que te debe sigue contando en el resumen.'),
      this.peopleSection('familia', 'Personas (familia)', 'Son las opciones de De quién (Recibido) y Para quién (Dado). Una persona desactivada no se ofrece en registros nuevos, pero sus registros se conservan.'),
    ];
  });

  protected edit(s: Section, item: CatalogItem | null) {
    this.editKind.set(s.kind);
    this.editScope.set(s.scope);
    this.editing.set(item);
    this.editOpen.set(true);
  }

  /** Activar o desactivar con el interruptor: se guarda al instante; si falla, el error queda a la vista. */
  protected async toggle(s: Section, item: CatalogItem, active: boolean) {
    const ok =
      s.kind === 'card' ? await this.fin.updateCard(item.id, { active }) : s.kind === 'concept' ? await this.fin.updateConcept(item.id, { active }) : await this.fin.updatePerson(item.id, { active });
    if (ok) this.toasts.show({ message: active ? `${item.name} activado` : `${item.name} desactivado` });
  }
}
