import { conceptLabel, debtRows, monthSummary, personSummaries, sortDebtRows } from './finanzas.calc';
import { cutsSheet, expensesSheet, familySheet, movementsSheet, peopleSheet, summarySheet, today } from './finanzas.export';
import { Expense, FamilyMove } from './finanzas.models';
import { FinanzasService } from './finanzas.service';
import { downloadXlsx } from './xlsx';

/** Un libro con el resumen, una hoja por tarjeta activa, los gastos fijos y los cortes (lo que exportaba "Gastos"). */
export function exportGastos(fin: FinanzasService): void {
  const concepts = fin.concepts();
  const expenses = fin.expenses();
  const cards = fin.cards().filter((c) => c.active);
  const label = (e: Expense) => conceptLabel(concepts, e.conceptId, e.conceptText);
  downloadXlsx(`Gastos - ${today()}`, [
    summarySheet(monthSummary(expenses, fin.income(), fin.cards())),
    ...cards.map((c) => expensesSheet(`Tarjeta ${c.name}`, expenses.filter((e) => e.cardId === c.id), true, label)),
    expensesSheet('Gastos fijos', expenses.filter((e) => e.section === 'fijos'), false, label),
    cutsSheet('Cortes', fin.cuts().filter((c) => cards.some((k) => k.id === c.cardId)), (id) => cards.find((c) => c.id === id)?.name ?? ''),
  ]);
}

/** Todo en un solo libro: gastos y cortes, dinero que me deben (por persona y movimientos) y dinero con familia. */
export function exportTodo(fin: FinanzasService): void {
  const concepts = fin.concepts();
  const people = fin.people();
  const expenses = fin.expenses();
  const cards = fin.cards().filter((c) => c.active);
  const label = (e: Expense) => conceptLabel(concepts, e.conceptId, e.conceptText);
  const rows = debtRows(fin.debts(), new Date(), people, concepts);
  const family = (direction: FamilyMove['direction'], name: string, header: string) =>
    familySheet(name, fin.family().filter((m) => m.direction === direction), header, (m) => conceptLabel(concepts, m.conceptId, m.conceptText), (m) => people.find((p) => p.id === m.personId)?.name ?? '');
  downloadXlsx(`JustMe - ${today()}`, [
    summarySheet(monthSummary(expenses, fin.income(), fin.cards())),
    ...cards.map((c) => expensesSheet(`Tarjeta ${c.name}`, expenses.filter((e) => e.cardId === c.id), true, label)),
    expensesSheet('Gastos fijos', expenses.filter((e) => e.section === 'fijos'), false, label),
    cutsSheet('Cortes', fin.cuts().filter((c) => cards.some((k) => k.id === c.cardId)), (id) => cards.find((c) => c.id === id)?.name ?? ''),
    peopleSheet(personSummaries(fin.debts(), people)),
    movementsSheet(sortDebtRows(rows, []), rows),
    family('recibido', 'Recibido', 'De quién'),
    family('dado', 'Dado', 'Para quién'),
  ]);
}
