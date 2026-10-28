import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Session } from '@supabase/supabase-js';
import { AuthService } from '../auth.service';
import { ConfigService } from '../config.service';
import { FinanzasService } from '../finanzas/finanzas.service';
import { DEFAULT_HABITS } from '../habits/habits.config';
import { HabitsStore } from '../habits/habits.store';

/**
 * Solo en desarrollo (ruta /_demo?to=/racha): llena la app con datos de ejemplo y una sesión falsa para ver las
 * pantallas sin entrar a Supabase. No escribe nada: las cargas de red se saltan y los guardados fallan a propósito.
 */
@Component({ selector: 'app-dev-demo', template: '' })
export class DevDemo {
  constructor() {
    const auth = inject(AuthService);
    const config = inject(ConfigService);
    const store = inject(HabitsStore);
    const fin = inject(FinanzasService);
    const router = inject(Router);

    const now = new Date();
    const at = (h: number, m: number, back = 0) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - back, h, m).toISOString();
    const iso = (back: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - back).toISOString().slice(0, 10);

    config.habits.set(DEFAULT_HABITS.map((h) => ({ ...h, active: true })));
    (config as unknown as { loading: Promise<void> }).loading = Promise.resolve();

    const all = (back: number) => Object.fromEntries(DEFAULT_HABITS.map((h) => [h.k, at(20, 0, back)]));
    store.days.set({
      [iso(0)]: { celular: at(8, 0), leetcode: at(10, 58), lecturas: at(21, 29), ingles: at(17, 34) },
      [iso(1)]: all(1),
      [iso(2)]: { celular: at(7, 5, 2), ingles: at(15, 0, 2) },
      [iso(4)]: all(4),
    });
    store.loaded.set(true);
    (store as unknown as { loading: Promise<void> }).loading = Promise.resolve();

    fin.cards.set([
      { id: 'c1', name: 'Santander', cutDay: 12, last4: '0149', active: true },
      { id: 'c2', name: 'BBVA', cutDay: 24, last4: '', active: true },
    ]);
    fin.concepts.set([
      { id: 'k1', scope: 'gasto', name: 'Netflix', active: true },
      { id: 'k2', scope: 'gasto', name: 'Recarga', active: true },
      { id: 'k3', scope: 'gasto', name: 'Amazon', active: true },
      { id: 'k4', scope: 'movimiento', name: 'Préstamo', active: true },
      { id: 'k5', scope: 'familia', name: 'Quincena', active: true },
    ]);
    const ex = (id: string, cardId: string | null, text: string, amount: number, total: number | null, installment = '') => ({
      id, section: cardId ? ('tarjeta' as const) : ('fijos' as const), cardId, conceptId: null, conceptText: text, installment, total, amount,
      purchasedAt: cardId ? at(12, 0, 3) : null,
    });
    fin.expenses.set([
      ex('e1', 'c1', 'Laptop', 2444.33, 21999.01, '05/09'),
      ex('e2', 'c1', 'Nintendo', 815.75, 9789, '04/12'),
      ex('e3', 'c1', 'shein botas', 610, 610),
      ex('e4', 'c1', 'Netflix', 348, 348),
      ex('e5', 'c1', 'Zurich Santander', 2829.1, 2829.1),
      ex('e6', 'c2', 'Gasolina', 2486, 2486),
      ex('e7', null, 'Renta', 4155, null),
    ]);
    fin.income.set(15000);
    fin.people.set([
      { id: 'p1', scope: 'deudor', name: 'Ismael', active: true },
      { id: 'p2', scope: 'deudor', name: 'Angeles', active: true },
      { id: 'p3', scope: 'familia', name: 'Mamá', active: true },
    ]);
    fin.debts.set([
      { id: 'd1', personId: 'p1', kind: 'cargo', conceptId: 'k4', conceptText: '', amount: 4227, date: iso(10), appliesTo: null },
      { id: 'd2', personId: 'p1', kind: 'abono', conceptId: null, conceptText: '', amount: 1000, date: iso(9), appliesTo: 'd1' },
      { id: 'd3', personId: 'p2', kind: 'cargo', conceptId: null, conceptText: 'Botas', amount: 716, date: iso(5), appliesTo: null },
      { id: 'd4', personId: 'p2', kind: 'cargo', conceptId: null, conceptText: 'Recarga', amount: 100, date: iso(40), appliesTo: null, archived: true },
      { id: 'd5', personId: 'p2', kind: 'abono', conceptId: null, conceptText: '', amount: 100, date: iso(38), appliesTo: 'd4' },
    ]);
    fin.cuts.set([{ id: 'u1', cardId: 'c1', period: '', periodEnd: null, amount: 0, paid: 0 }]);
    fin.family.set([
      { id: 'f1', direction: 'recibido', conceptId: 'k5', conceptText: '', personId: 'p3', date: iso(3), amount: 2500 },
      { id: 'f2', direction: 'dado', conceptId: null, conceptText: 'Súper', personId: 'p3', date: iso(2), amount: 800 },
    ]);
    fin.loaded.set(true);
    (fin as unknown as { loading: Promise<void> }).loading = Promise.resolve();

    // /_demo?empty=1&to=…: la misma app, sin nada capturado (para ver los estados vacíos).
    if (new URLSearchParams(location.search).has('empty')) {
      store.days.set({});
      for (const s of [fin.expenses, fin.debts, fin.family, fin.cuts, fin.cards, fin.people, fin.concepts]) (s as { set(v: unknown[]): void }).set([]);
      fin.income.set(0);
    }

    // Después de que Supabase anuncie "sin sesión" (INITIAL_SESSION), para que no la borre.
    void auth.ready.then(() =>
      setTimeout(() => {
        auth.session.set({ user: { id: 'demo', email: 'demo@example.test' } } as Session);
        void router.navigateByUrl(new URLSearchParams(location.search).get('to') ?? '/');
      }, 600),
    );
  }
}
