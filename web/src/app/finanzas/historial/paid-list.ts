import { Component, computed, inject } from '@angular/core';
import { debtRows, fmtDate, fmtMoney, paidCargos } from '../finanzas.calc';
import { FinanzasService } from '../finanzas.service';

/**
 * Cargos ya pagados por completo: pasan solos aquí con sus abonos. Si hubo un error, se pueden regresar a pendiente
 * (el cargo y sus pagos vuelven a la lista de Movimientos para corregirlos).
 */
@Component({
  selector: 'app-paid-list',
  template: `
    <section class="card s-sage">
      <h2>Pagados</h2>
      <p class="hint">
        Cuando un cargo se termina de pagar pasa aquí con sus abonos. Si fue un error, regrésalo a pendiente y corrige sus
        pagos.
      </p>
      @for (g of groups(); track g.cargo.id) {
        <article class="paid">
          <div class="ptop">
            <b>{{ g.cargo.personName }}</b>
            <span>{{ g.cargo.conceptName || 'Sin concepto' }}</span>
            <b class="amt">{{ money(g.cargo.amount) }}</b>
            <button type="button" class="ghost" [disabled]="busy" (click)="restore(g.cargo.id, g.cargo.personName)">
              Regresar a pendiente
            </button>
          </div>
          <ul>
            <li class="cg">Cargo del {{ g.cargo.date ? fmtDate(g.cargo.date) : 'sin fecha' }}</li>
            @for (p of g.payments; track p.id) {
              <li>Pago de {{ money(p.amount) }} · {{ p.date ? fmtDate(p.date) : 'sin fecha' }}</li>
            }
          </ul>
        </article>
      } @empty {
        <p class="hint">Todavía no hay cargos pagados por completo.</p>
      }
    </section>
  `,
  styleUrl: '../finanzas.shared.css',
  styles: `
    .paid{border-top:1px solid var(--line);padding:8px 0;display:flex;flex-direction:column;gap:4px}
    .ptop{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
    .ptop span{color:var(--muted);flex:1;min-width:0;overflow-wrap:anywhere}
    .amt{font-variant-numeric:tabular-nums}
    ul{margin:0;padding-left:18px;font-size:.82rem;color:var(--muted)}
    .cg{color:var(--ink)}
  `,
})
export class PaidList {
  private readonly fin = inject(FinanzasService);
  protected readonly money = fmtMoney;
  protected readonly fmtDate = fmtDate;
  protected busy = false;

  protected readonly groups = computed(() =>
    paidCargos(debtRows(this.fin.debts(), new Date(), this.fin.people(), this.fin.concepts())),
  );

  protected async restore(id: string, who: string) {
    if (!confirm(`¿Regresar a pendiente este cargo de ${who}?\n\nVuelve a Movimientos con sus pagos para que los corrijas.`)) return;
    this.busy = true;
    await this.fin.setArchived(id, false);
    this.busy = false;
  }
}
