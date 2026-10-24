import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ExportButton } from '../export-button/export-button';
import { fmtMoney } from '../finanzas.calc';
import { historySheet, today } from '../finanzas.export';
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
import { deleteHistoryMessage, plural } from '../finanzas.warn';
import { downloadXlsx } from '../xlsx';

/** Cuántos registros se piden cada vez. */
const PAGE = 100;

const ACTIONS: Record<AuditAction, string> = { insert: 'Agregado', update: 'Editado', delete: 'Eliminado' };

/**
 * Historial: todo lo que se agregó, editó o eliminó, con su fecha y hora. Sirve para revisar pagos y cobros
 * (también los que ya se eliminaron) y aclarar malos entendidos. Se pueden exportar a Excel o borrar por completo
 * una o varias líneas (solo la línea del historial: el movimiento real no se toca).
 */
@Component({
  selector: 'app-historial-page',
  imports: [ExportButton],
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
  protected readonly notice = signal('');
  /** Borrando o preparando la exportación: se bloquean los botones. */
  protected readonly busy = signal(false);

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

  // Selección (ids de las líneas marcadas). Solo cuentan las que se ven: lo oculto por un filtro no se borra.
  private readonly marked = signal<ReadonlySet<number>>(new Set());
  protected readonly selected = computed(() => this.visible().filter((l) => this.marked().has(l.id)));
  protected readonly allSelected = computed(() => this.visible().length > 0 && this.selected().length === this.visible().length);
  protected readonly someSelected = computed(() => this.selected().length > 0 && !this.allSelected());

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

  protected isMarked(id: number): boolean {
    return this.marked().has(id);
  }

  protected toggle(id: number) {
    this.marked.update((set) => {
      const next = new Set(set);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  /** Marca todo lo que se ve; si ya estaba todo marcado, lo desmarca. */
  protected toggleAll() {
    const ids = this.visible().map((l) => l.id);
    this.marked.update((set) => {
      const next = new Set(set);
      if (this.allSelected()) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  protected clearSelection() {
    this.marked.set(new Set());
  }

  /** Borra por completo de la base de datos las líneas marcadas (solo las que se ven). */
  protected async deleteSelected() {
    const ids = this.selected().map((l) => l.id);
    if (!ids.length || this.busy() || !confirm(deleteHistoryMessage(ids.length))) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    const ok = await this.fin.deleteAudit(ids);
    if (ok) {
      const gone = new Set(ids);
      this.entries.update((l) => l.filter((e) => !gone.has(e.id)));
      this.clearSelection();
      this.notice.set(`✓ ${plural(ids.length, 'registro eliminado', 'registros eliminados')} del historial.`);
    } else {
      // Pudo borrarse una parte: se vuelve a leer para mostrar lo que de verdad queda.
      this.error.set('No se pudo eliminar del historial. Revisa tu conexión e intenta de nuevo.');
      this.clearSelection();
      await this.reload();
    }
    this.busy.set(false);
  }

  /** Exporta lo que se ve (con los filtros); antes carga lo que falte para no dejar el archivo a medias. */
  protected async exportExcel() {
    this.busy.set(true);
    this.notice.set('');
    while (this.more() && !this.error()) await this.fetch(this.entries().length);
    this.busy.set(false);
    if (this.error()) return;
    const label = HISTORY_AREAS.find((a) => a.key === this.area())?.label ?? 'Historial';
    downloadXlsx(`Historial ${label} - ${today()}`, [historySheet(label, this.visible())]);
  }

  private async reload() {
    this.entries.set([]);
    this.clearSelection();
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
