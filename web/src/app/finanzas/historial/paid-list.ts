import { Component, computed, inject, signal } from '@angular/core';
import { DebtRow, debtRows, fmtDate, fmtMoney, paidCargos, sum } from '../finanzas.calc';
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
              <li>
                Pago de {{ money(p.amount) }} · {{ p.date ? fmtDate(p.date) : 'sin fecha' }}
                @if (siblings(p); as all) {
                  <button type="button" class="more" [attr.aria-expanded]="open(p)" (click)="toggle(p)">
                    parte de un pago de {{ money(total(all)) }} en {{ all.length }} cargos
                  </button>
                  @if (open(p)) {
                    <ul>
                      @for (s of all; track s.id) {
                        <li>{{ target(s) }}: {{ money(s.amount) }}</li>
                      }
                    </ul>
                  }
                }
              </li>
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
    .more{font:inherit;font-size:.78rem;background:none;border:0;padding:0 0 0 6px;color:var(--sec,var(--accent));text-decoration:underline;cursor:pointer}
  `,
})
export class PaidList {
  private readonly fin = inject(FinanzasService);
  protected readonly money = fmtMoney;
  protected readonly fmtDate = fmtDate;
  protected busy = false;

  private readonly all = computed(() => debtRows(this.fin.debts(), new Date(), this.fin.people(), this.fin.concepts()));
  protected readonly groups = computed(() => paidCargos(this.all()));

  private readonly opened = signal<ReadonlySet<string>>(new Set());

  /** Todos los abonos del mismo pago repartido; null si el pago fue a un solo cargo. */
  protected siblings(p: DebtRow): DebtRow[] | null {
    if (!p.paymentId) return null;
    const all = this.all().filter((x) => x.paymentId === p.paymentId);
    return all.length > 1 ? all : null;
  }

  protected total(rows: DebtRow[]): number {
    return sum(rows.map((r) => r.amount));
  }

  protected target(p: DebtRow): string {
    const c = p.appliesTo ? this.all().find((x) => x.id === p.appliesTo) : null;
    return c ? c.conceptName || 'Sin concepto' : 'Sin asignar';
  }

  protected open(p: DebtRow): boolean {
    return this.opened().has(p.id);
  }

  protected toggle(p: DebtRow) {
    this.opened.update((s) => {
      const n = new Set(s);
      if (!n.delete(p.id)) n.add(p.id);
      return n;
    });
  }

  protected async restore(id: string, who: string) {
    if (!confirm(`¿Regresar a pendiente este cargo de ${who}?\n\nVuelve a Movimientos con sus pagos para que los corrijas.`)) return;
    this.busy = true;
    await this.fin.setArchived(id, false);
    this.busy = false;
  }
}
