import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { fmtMoney } from '../finanzas.calc';
import {
  AuditAction,
  AuditEntry,
  HISTORY_AREAS,
  HistoryArea,
  HistoryLine,
  NameOf,
  describeEntry,
  fmtDateTime,
} from '../finanzas.history';
import { FinanzasService } from '../finanzas.service';

/** Cuántos registros se piden cada vez. */
const PAGE = 100;

const ACTIONS: Record<AuditAction, string> = { insert: 'Agregado', update: 'Editado', delete: 'Eliminado' };

/**
 * Historial: todo lo que se agregó, editó o eliminó, con su fecha y hora. Sirve para revisar pagos y cobros
 * (también los que ya se eliminaron) y aclarar malos entendidos.
 */
@Component({
  selector: 'app-historial-page',
  templateUrl: './historial-page.html',
  styleUrls: ['../finanzas.shared.css', './historial-page.css'],
})
export class HistorialPage implements OnInit {
  private readonly fin = inject(FinanzasService);

  protected readonly areas = HISTORY_AREAS;
  protected readonly actions = ACTIONS;
  protected readonly money = fmtMoney;
  protected readonly when = fmtDateTime;

  protected readonly area = signal<HistoryArea>('movimientos');
  protected readonly tone = computed(() => HISTORY_AREAS.find((a) => a.key === this.area())?.tone ?? '');

  private readonly entries = signal<AuditEntry[]>([]);
  private readonly catalog = signal<AuditEntry[]>([]);
  protected readonly loading = signal(true);
  protected readonly more = signal(false);
  protected readonly error = signal('');

  // Filtros (se aplican a lo ya cargado)
  protected readonly person = signal('');
  protected readonly kind = signal<'' | 'abono' | 'cargo'>('');
  protected readonly action = signal<'' | AuditAction>('');
  protected readonly query = signal('');

  /** Nombres de tarjetas, personas y conceptos: los de ahora y los de los ya eliminados (por su historial). */
  private readonly names = computed(() => {
    const names = new Map<string, string>();
    for (const e of this.catalog()) {
      const name = (e.new ?? e.old)?.['name'];
      if (typeof name === 'string') names.set(e.rowId, name);
    }
    for (const x of [...this.fin.cards(), ...this.fin.people(), ...this.fin.concepts()]) names.set(x.id, x.name);
    return names;
  });
  private readonly nameOf: NameOf = (id) => (id ? (this.names().get(id) ?? '(eliminado)') : '');

  private readonly lines = computed(() => this.entries().map((e) => describeEntry(e, this.nameOf)));

  /** Personas que aparecen en lo cargado (para el filtro). */
  protected readonly people = computed(() =>
    [...new Set(this.lines().map((l) => l.who).filter((w) => w && w !== '—'))].sort((a, b) =>
      a.localeCompare(b, 'es', { sensitivity: 'base' }),
    ),
  );
  protected readonly hasPeople = computed(() => this.area() === 'movimientos' || this.area() === 'familia');

  protected readonly visible = computed<HistoryLine[]>(() => {
    const q = this.query().trim().toLowerCase();
    return this.lines().filter(
      (l) =>
        (!this.person() || l.who === this.person()) &&
        (!this.kind() || l.kind === this.kind()) &&
        (!this.action() || l.action === this.action()) &&
        (!q || `${l.who} ${l.what} ${l.badge}`.toLowerCase().includes(q)),
    );
  });

  async ngOnInit() {
    try {
      this.catalog.set(await this.fin.loadAuditNames());
    } catch {
      // Sin nombres de lo eliminado, el historial igual se puede leer.
    }
    await this.reload();
  }

  protected async pick(area: HistoryArea) {
    if (area === this.area()) return;
    this.area.set(area);
    this.person.set('');
    this.kind.set('');
    await this.reload();
  }

  protected async loadMore() {
    await this.fetch(this.entries().length);
  }

  protected clearFilters() {
    this.person.set('');
    this.kind.set('');
    this.action.set('');
    this.query.set('');
  }

  protected get filtered(): boolean {
    return !!(this.person() || this.kind() || this.action() || this.query());
  }

  private async reload() {
    this.entries.set([]);
    await this.fetch(0);
  }

  private async fetch(offset: number) {
    const tables = HISTORY_AREAS.find((a) => a.key === this.area())?.tables ?? [];
    this.loading.set(true);
    this.error.set('');
    try {
      const page = await this.fin.loadAudit(tables, offset, PAGE);
      this.entries.update((l) => (offset === 0 ? page : [...l, ...page]));
      this.more.set(page.length === PAGE);
    } catch {
      this.error.set('No se pudo cargar el historial. Revisa tu conexión e intenta de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }
}
