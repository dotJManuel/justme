import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { debtsWithDependents } from '../finanzas.calc';
import { Person } from '../finanzas.models';
import { deleteMessage, plural } from '../finanzas.warn';
import { FinanzasService } from '../finanzas.service';

/** Catálogo de personas: agregar, renombrar, desactivar y eliminar. */
@Component({
  selector: 'app-people-admin',
  imports: [FormsModule],
  templateUrl: './people-admin.html',
  styleUrl: '../finanzas.shared.css',
})
export class PeopleAdmin {
  private readonly fin = inject(FinanzasService);

  readonly scope = input.required<Person['scope']>();
  readonly title = input.required<string>();
  readonly help = input.required<string>();

  protected readonly cols = 'minmax(0,2fr) 9rem 5.5rem';

  /** Qué más se borra al eliminar una persona de este catálogo. */
  protected readonly warning = computed(() =>
    this.scope() === 'familia'
      ? 'Si eliminas a una persona, se borran también todos sus registros de Recibido y Dado.'
      : 'Si eliminas a una persona, se borran también todos sus movimientos (cargos y abonos).',
  );

  protected readonly people = computed(() => this.fin.people().filter((p) => p.scope === this.scope()));

  protected readonly name = signal('');

  /** Cuántos movimientos tiene cada persona. */
  protected readonly usage = computed(() => {
    const counts = new Map<string, number>();
    const ids =
      this.scope() === 'familia' ? this.fin.family().map((m) => m.personId) : this.fin.debts().map((d) => d.personId);
    for (const id of ids) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    return counts;
  });

  protected usageText(p: Person): string {
    const n = this.usage().get(p.id) ?? 0;
    return n === 0 ? 'Sin movimientos' : n === 1 ? '1 movimiento' : `${n} movimientos`;
  }

  protected setName(p: Person, el: HTMLInputElement) {
    const name = el.value.trim();
    if (!name) return void (el.value = p.name);
    if (name !== p.name) this.save(p, el, { name });
  }

  protected toggle(p: Person) {
    return this.fin.updatePerson(p.id, { active: !p.active });
  }

  protected async remove(p: Person) {
    const familia = this.scope() === 'familia';
    const n = familia ? (this.usage().get(p.id) ?? 0) : debtsWithDependents(this.fin.debts(), (d) => d.personId === p.id).length;
    const what = familia
      ? plural(n, 'registro de Recibido o Dado', 'registros de Recibido y Dado')
      : `${plural(n, 'movimiento', 'movimientos')} (cargos y abonos)`;
    const message = deleteMessage(`a «${p.name}»`, n ? [what] : [], 'Si solo quieres dejar de usarla, desactívala.');
    if (confirm(message)) await this.fin.removePerson(p.id);
  }

  protected async add() {
    const name = this.name().trim();
    if (!name) return;
    if (await this.fin.addPerson(this.scope(), name)) this.name.set('');
  }

  private async save(p: Person, el: HTMLInputElement, patch: Partial<Pick<Person, 'name'>>) {
    if (!(await this.fin.updatePerson(p.id, patch))) el.value = p.name;
  }
}
