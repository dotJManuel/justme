import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Concept } from '../finanzas.models';
import { FinanzasService } from '../finanzas.service';

/** Catálogo de opciones de un select: agregar, renombrar, desactivar y eliminar. */
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

  protected readonly cols = 'minmax(0,2fr) 9rem 5.5rem';

  protected readonly concepts = computed(() => this.fin.concepts().filter((c) => c.scope === this.scope()));

  protected readonly name = signal('');

  /** Cuántos registros usan cada opción (los gastos, en el catálogo de gastos). */
  protected readonly usage = computed(() => {
    const counts = new Map<string, number>();
    for (const e of this.fin.expenses()) counts.set(e.conceptId, (counts.get(e.conceptId) ?? 0) + 1);
    return counts;
  });

  protected usageText(c: Concept): string {
    const n = this.usage().get(c.id) ?? 0;
    return n === 0 ? 'Sin gastos' : n === 1 ? '1 gasto' : `${n} gastos`;
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
    const n = this.usage().get(c.id) ?? 0;
    const detail =
      n > 0
        ? `\n\nTambién se ${n === 1 ? 'eliminará 1 gasto que lo usa' : `eliminarán ${n} gastos que lo usan`}. Si solo quieres dejar de usarlo, desactívalo.`
        : '';
    if (confirm(`¿Eliminar «${c.name}» por completo?${detail}`)) await this.fin.removeConcept(c.id);
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
