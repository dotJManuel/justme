import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CreditCard } from '../finanzas.models';
import { FinanzasService } from '../finanzas.service';

const validDay = (n: number): boolean => Number.isInteger(n) && n >= 1 && n <= 31;

/** Catálogo de tarjetas de crédito: agregar, renombrar, cambiar el día de corte, desactivar y eliminar. */
@Component({
  selector: 'app-cards-admin',
  imports: [FormsModule],
  templateUrl: './cards-admin.html',
  styleUrl: '../finanzas.shared.css',
})
export class CardsAdmin {
  private readonly fin = inject(FinanzasService);

  protected readonly cards = this.fin.cards;
  protected readonly cols = 'minmax(0,2fr) 7rem 5.5rem 5.5rem';

  protected readonly name = signal('');
  protected readonly cutDay = signal('');
  protected readonly canAdd = computed(() => this.name().trim() !== '' && validDay(Number(this.cutDay())));

  protected setName(c: CreditCard, el: HTMLInputElement) {
    const name = el.value.trim();
    if (!name) return void (el.value = c.name);
    if (name !== c.name) this.save(c, el, { name }, c.name);
  }

  protected setCutDay(c: CreditCard, el: HTMLInputElement) {
    const day = Number(el.value);
    if (!validDay(day)) {
      el.value = String(c.cutDay);
      this.fin.error.set('El día de corte debe ser un número del 1 al 31.');
    } else if (day !== c.cutDay) {
      this.save(c, el, { cutDay: day }, String(c.cutDay));
    }
  }

  protected toggle(c: CreditCard) {
    return this.fin.updateCard(c.id, { active: !c.active });
  }

  protected async remove(c: CreditCard) {
    const expenses = this.fin.expenses().filter((e) => e.cardId === c.id).length;
    const cuts = this.fin.cuts().filter((x) => x.cardId === c.id).length;
    const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    const detail =
      expenses + cuts > 0
        ? `\n\nTambién se eliminarán ${plural(expenses, 'gasto', 'gastos')} y ${plural(cuts, 'corte', 'cortes')} de esta tarjeta. Si solo quieres ocultarla, desactívala.`
        : '';
    if (confirm(`¿Eliminar la tarjeta «${c.name}» por completo?${detail}`)) await this.fin.removeCard(c.id);
  }

  protected async add() {
    if (!this.canAdd()) return;
    const ok = await this.fin.addCard(this.name().trim(), Number(this.cutDay()));
    if (ok) {
      this.name.set('');
      this.cutDay.set('');
    }
  }

  protected usage(c: CreditCard): string {
    const n = this.fin.expenses().filter((e) => e.cardId === c.id).length;
    return n === 0 ? 'Sin gastos' : n === 1 ? '1 gasto' : `${n} gastos`;
  }

  private async save(c: CreditCard, el: HTMLInputElement, patch: Partial<CreditCard>, back: string) {
    if (!(await this.fin.updateCard(c.id, patch))) el.value = back;
  }
}
