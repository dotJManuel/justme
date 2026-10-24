import { AuditEntry, describeEntry } from './finanzas.history';
import { deleteMessage, deleteRowMessage, plural } from './finanzas.warn';

const NAMES: Record<string, string> = { p1: 'Isma', k1: 'Pago Nintendo', c1: 'Santander' };
const nameOf = (id: string | null | undefined) => (id ? (NAMES[id] ?? '(eliminado)') : '');

const entry = (e: Partial<AuditEntry> & Pick<AuditEntry, 'table' | 'action'>): AuditEntry => ({
  id: 1,
  at: '2026-10-24T22:52:00.000Z',
  rowId: 'r1',
  old: null,
  new: null,
  ...e,
});

describe('historial', () => {
  it('un abono agregado muestra quién, concepto, monto y la fecha del movimiento', () => {
    const l = describeEntry(
      entry({
        table: 'fin_debts',
        action: 'insert',
        new: { id: 'r1', person_id: 'p1', kind: 'abono', concept_id: 'k1', concept_text: '', amount: 1000, date: '2026-07-20' },
      }),
      nameOf,
    );
    expect(l).toMatchObject({ badge: 'Abono', kind: 'abono', who: 'Isma', what: 'Pago Nintendo', amount: 1000, action: 'insert' });
    expect(l.when).toContain('2026');
    expect(l.changes).toEqual([]);
  });

  it('un concepto escrito a mano manda sobre el del catálogo', () => {
    const l = describeEntry(
      entry({ table: 'fin_debts', action: 'insert', new: { person_id: 'p1', kind: 'cargo', concept_id: null, concept_text: 'Cena única', amount: 300 } }),
      nameOf,
    );
    expect(l.what).toBe('Cena única');
    expect(l.badge).toBe('Cargo');
  });

  it('una edición lista solo lo que cambió, con el antes y el después', () => {
    const base = { id: 'r1', user_id: 'u', person_id: 'p1', kind: 'abono', concept_id: null, concept_text: 'Pago', date: '2026-07-20', applies_to: null };
    const l = describeEntry(
      entry({ table: 'fin_debts', action: 'update', old: { ...base, amount: 500 }, new: { ...base, amount: 600 } }),
      nameOf,
    );
    expect(l.changes).toHaveLength(1);
    expect(l.changes[0].label).toBe('Monto');
    expect(l.changes[0].from).toContain('500');
    expect(l.changes[0].to).toContain('600');
  });

  it('cambiar el concepto de catálogo a texto libre cuenta como un solo cambio', () => {
    const base = { person_id: 'p1', kind: 'cargo', amount: 10 };
    const l = describeEntry(
      entry({
        table: 'fin_debts',
        action: 'update',
        old: { ...base, concept_id: 'k1', concept_text: '' },
        new: { ...base, concept_id: null, concept_text: 'Algo único' },
      }),
      nameOf,
    );
    expect(l.changes).toEqual([{ label: 'Concepto', from: 'Pago Nintendo', to: 'Algo único' }]);
  });

  it('un borrado se muestra con la copia que tenía', () => {
    const l = describeEntry(
      entry({ table: 'fin_debts', action: 'delete', old: { person_id: 'p1', kind: 'cargo', concept_text: 'Nintendo', amount: 7000 } }),
      nameOf,
    );
    expect(l).toMatchObject({ action: 'delete', who: 'Isma', what: 'Nintendo', amount: 7000 });
  });

  it('si la persona ya no existe, lo dice en vez de dejarlo vacío', () => {
    const l = describeEntry(entry({ table: 'fin_debts', action: 'insert', new: { person_id: 'zzz', kind: 'cargo', amount: 1 } }), nameOf);
    expect(l.who).toBe('(eliminado)');
  });

  it('un gasto fijo no tiene tarjeta', () => {
    const l = describeEntry(entry({ table: 'fin_expenses', action: 'insert', new: { card_id: null, concept_text: 'Internet', amount: 500 } }), nameOf);
    expect(l).toMatchObject({ badge: 'Gasto', who: 'Gastos fijos', what: 'Internet', amount: 500 });
    const t = describeEntry(entry({ table: 'fin_expenses', action: 'insert', new: { card_id: 'c1', concept_text: 'Netflix', amount: 348 } }), nameOf);
    expect(t.who).toBe('Santander');
  });
});

describe('advertencias al eliminar', () => {
  it('dicen qué más se borra y que queda en el Historial', () => {
    const m = deleteMessage('la tarjeta «BBVA»', [plural(3, 'gasto', 'gastos'), plural(1, 'corte', 'cortes')], 'Si solo quieres ocultarla, desactívala.');
    expect(m).toContain('⚠');
    expect(m).toContain('3 gastos y 1 corte');
    expect(m).toContain('Historial');
    expect(m).toContain('desactívala');
  });

  it('si no hay nada relacionado, también lo dicen', () => {
    expect(deleteMessage('la persona «Ange»', [])).toContain('No tiene nada relacionado');
  });

  it('un registro suelto avisa que queda en el Historial', () => {
    expect(deleteRowMessage('el gasto «Netflix»')).toContain('Historial');
  });
});
