import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { debtsWithDependents } from '../finanzas.calc';
import { Concept } from '../finanzas.models';
import { deleteMessage, plural } from '../finanzas.warn';
import { FinanzasService } from '../finanzas.service';

/** Catálogo de opciones de un select de conceptos: agregar, renombrar, desactivar y eliminar. */
@Component({
  selector: 'app-concepts-admin',
  imports: [FormsModule],
  templateUrl: './concepts-admin.html',
  styleUrl: '../finanzas.shared.css',
})
export class ConceptsAdmin {
  private readonly fin = inject(FinanzasService);

  readonly scope = input.required<Concept['scope']>();
  readonly title = input.required<string>();
  readonly help = input.required<string>();

  protected readonly cols = 'minmax(0,2fr) 9rem 5.5rem';

  /** Qué más se borra al eliminar un concepto de este catálogo. */
  protected readonly warning = computed(() => {
    const scope = this.scope();
    if (scope === 'gasto') return 'Si eliminas un concepto, se borran también todos los gastos que lo usan.';
    if (scope === 'movimiento') return 'Si eliminas un concepto, se borran también todos los movimientos (cargos y abonos) que lo usan.';
    return 'Si eliminas un concepto, se borran también todos los registros de Recibido y Dado que lo usan.';
  });

  protected readonly concepts = computed(() => this.fin.concepts().filter((c) => c.scope === this.scope()));
  /** Tope de caracteres: los conceptos de movimientos eran texto más largo. */
  protected readonly maxLength = computed(() => (this.scope() === 'movimiento' ? 200 : 120));
  private readonly unit = computed(() => (this.scope() === 'gasto' ? 'gasto' : 'movimiento'));

  protected readonly name = signal('');

  /** Cuántos registros usan cada opción (gastos o movimientos, según el catálogo). */
  protected readonly usage = computed(() => {
    const counts = new Map<string, number>();
    const scope = this.scope();
    const ids =
      scope === 'movimiento'
        ? this.fin.debts().map((d) => d.conceptId)
        : scope === 'familia'
          ? this.fin.family().map((m) => m.conceptId)
          : this.fin.expenses().map((e) => e.conceptId);
    for (const id of ids) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    return counts;
  });

  protected usageText(c: Concept): string {
    const n = this.usage().get(c.id) ?? 0;
    const unit = this.unit();
    return n === 0 ? `Sin ${unit}s` : n === 1 ? `1 ${unit}` : `${n} ${unit}s`;
  }

  protected setName(c: Concept, el: HTMLInputElement) {
    const name = el.value.trim();
    if (!name) return void (el.value = c.name);
    if (name !== c.name) this.save(c, el, { name });
  }

  protected toggle(c: Concept) {
    return this.fin.updateConcept(c.id, { active: !c.active });
  }

  protected async remove(c: Concept) {
    // Los movimientos arrastran además los abonos aplicados a los cargos que se borran.
    const scope = this.scope();
    const n = scope === 'movimiento' ? debtsWithDependents(this.fin.debts(), (d) => d.conceptId === c.id).length : (this.usage().get(c.id) ?? 0);
    const what =
      scope === 'gasto'
        ? plural(n, 'gasto', 'gastos')
        : scope === 'movimiento'
          ? `${plural(n, 'movimiento', 'movimientos')} (cargos y abonos)`
          : plural(n, 'registro de Recibido o Dado', 'registros de Recibido y Dado');
    const message = deleteMessage(`el concepto «${c.name}»`, n ? [what] : [], 'Si solo quieres dejar de usarlo, desactívalo.');
    if (confirm(message)) await this.fin.removeConcept(c.id);
  }

  protected async add() {
    const name = this.name().trim();
    if (!name) return;
    if (await this.fin.addConcept(this.scope(), name)) this.name.set('');
  }

  private async save(c: Concept, el: HTMLInputElement, patch: Partial<Pick<Concept, 'name'>>) {
    if (!(await this.fin.updateConcept(c.id, patch))) el.value = c.name;
  }
}
