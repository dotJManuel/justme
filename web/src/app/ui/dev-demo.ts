import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Session } from '@supabase/supabase-js';
import { AuthService } from '../auth.service';
import { ConfigService } from '../config.service';
import { FinanzasService } from '../finanzas/finanzas.service';
import { DEFAULT_HABITS } from '../habits/habits.config';
import { HabitsStore } from '../habits/habits.store';
import { inferGroup } from '../habits/mission-groups';
import { Block } from '../notas/notas.blocks';
import { Note, NotasService } from '../notas/notas.service';
import { LinksService } from '../perfil/links.service';
import { RespaldoService } from '../respaldo/respaldo.service';
import { BadgesService } from '../racha/badges.service';
import { DEFAULT_BADGES } from '../racha/logros.config';

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
    const links = inject(LinksService);
    const badges = inject(BadgesService);
    const notas = inject(NotasService);
    const respaldo = inject(RespaldoService);
    const router = inject(Router);

    const now = new Date();
    const at = (h: number, m: number, back = 0) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - back, h, m).toISOString();
    const iso = (back: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - back).toISOString().slice(0, 10);

    const groups = ['Mañana', 'Durante el día', 'Noche', 'Tarde'].map((name, i) => ({ id: 'g' + i, name }));
    config.groups.set(groups);
    config.groupsReady.set(true);
    config.planReady.set(true);
    config.habits.set(
      DEFAULT_HABITS.map((h) => {
        const tarde = h.k === 'revisar'; // una misión en un grupo propio
        const name = tarde ? 'Tarde' : inferGroup(h.when);
        return { ...h, active: true, when: tarde ? '15:00 · 20 min' : h.when, groupId: groups.find((g) => g.name === name)?.id ?? null };
      }),
    );
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
        links.links.set(
      new URLSearchParams(location.search).has('empty')
        ? []
        : [
            { id: 'l1', title: 'Prep de entrevistas', url: 'https://interview-prepjm.netlify.app/', note: 'Preguntas y respuestas para repasar' },
            { id: 'l2', title: 'Banco', url: 'https://www.ejemplo.com/cuenta', note: '' },
          ],
    );
    links.loaded.set(true);
    // Metas ajustadas a los pocos días de la demo, para ver los cuatro niveles (y uno sin nivel)
    const demoTargets: Record<number, number[]> = { 0: [1, 5, 20, 25], 1: [1, 3, 7, 14], 3: [1, 2, 3, 30], 5: [5, 20, 40, 80] };
    badges.all.set(
      DEFAULT_BADGES.map((b, i) => ({
        ...b,
        ...(i === 5 ? { kind: 'misiones' as const, name: 'Imparable' } : {}),
        targets: demoTargets[i] ?? b.targets,
        id: 'b' + i,
        active: i !== 4,
      })),
    );
    badges.loaded.set(true);
    (badges as unknown as { loading: Promise<void> }).loading = Promise.resolve();
    (links as unknown as { loading: Promise<void> }).loading = Promise.resolve();

    // Notas de ejemplo; el bloqueo y el guardado se simulan en memoria (la nota «Compras» la "edita otra pestaña").
    const b = (id: string, type: Block['type'], text = '', done = false): Block => (type === 'todo' ? { id, type, text, done } : { id, type, text });
    const hour = 3_600_000;
    let order = 0;
    const mk = (n: Partial<Note> & Pick<Note, 'id' | 'blocks'>, ago: number): Note => {
      const at = new Date(now.getTime() - ago * hour).toISOString();
      return { title: '', icon: '', parentId: null, lockHolder: null, lockUntil: null, updatedAt: at, createdAt: at, sortOrder: order++, pinOrder: null, ...n };
    };
    const demoNotes: Note[] = new URLSearchParams(location.search).has('empty')
      ? []
      : [
          mk(
            {
              id: '11111111-1111-4111-8111-111111111111', title: 'Plan de la semana', icon: '🎯', pinOrder: 1,
              blocks: [
                b('a0', 'toc'),
                b('a1', 'h1', 'Prioridades'), b('a2', 'p', 'Lo que <b>no se negocia</b> esta semana, <i>en orden</i>: usa <code>Ctrl+B</code> o <s>tacha</s> lo hecho. Más en <a href="https://interview-prepjm.netlify.app/">prep de entrevistas</a>.'),
                { id: 'a2c', type: 'callout', text: 'Recuerda: la racha se cuida <b>todos los días</b>.', icon: '🔥' },
                b('a3', 'todo', 'Terminar el módulo de notas', true), b('a4', 'todo', 'Repasar LeetCode 30 min'), b('a5', 'todo', 'Llamar a mamá'),
                b('a6', 'hr'), b('a7', 'h2', 'Presupuesto'),
                { id: 'a7t', type: 'table', text: '', rows: [['Concepto', 'Monto', 'Estado'], ['Renta', '<b>$4,155</b>', '✅ Pagada'], ['Netflix', '$348', '⏳ Pendiente'], ['Súper', '$1,200', '']] },
                b('a8', 'h2', 'Ideas'), b('a9', 'ul', 'Ahorro automático por quincena'), b('a10', 'ul', 'Meta de lectura'),
                b('a11', 'quote', 'Lo importante es no romper la racha.'),
                { id: 'a11i', type: 'image', path: 'demo/foto.svg', text: 'Una imagen de ejemplo, con su <i>descripción</i>' },
                { id: 'a12', type: 'code', text: 'const racha = dias.filter((d) =&gt; d.completo).length;\nconsole.log(racha);' },
                { id: 'a13', type: 'page', text: '', ref: '44444444-4444-4444-8444-444444444444' },
                b('a14', 'p', ''),
              ],
            },
            1,
          ),
          mk({ id: '22222222-2222-4222-8222-222222222222', title: 'Compras', icon: '🛒', pinOrder: 0, blocks: [b('c1', 'ul', 'Leche'), b('c2', 'ul', 'Huevo'), b('c3', 'ul', 'Café')], lockHolder: 'otra-pestana', lockUntil: new Date(now.getTime() + hour).toISOString() }, 26),
          mk({ id: '33333333-3333-4333-8333-333333333333', blocks: [b('d1', 'p', '')] }, 9 * 24),
          mk(
            {
              id: '44444444-4444-4444-8444-444444444444', title: 'Rutina de ejercicio', icon: '💪', parentId: '11111111-1111-4111-8111-111111111111',
              blocks: [b('r1', 'h2', 'Lunes'), b('r2', 'ul', 'Sentadillas 4×12'), b('r3', 'ul', 'Flexiones 3×15'), b('r4', 'p', 'Descansar 60 s entre series.')],
            },
            3,
          ),
          mk({ id: '55555555-5555-4555-8555-555555555555', title: 'Trabajo', icon: '💼', blocks: [b('t1', 'p', 'Todo lo del trabajo, agrupado.')] }, 5),
          mk({ id: '66666666-6666-4666-8666-666666666666', title: 'Reuniones', icon: '📅', parentId: '55555555-5555-4555-8555-555555555555', blocks: [b('m1', 'p', 'Notas de reuniones.')] }, 6),
          mk({ id: '77777777-7777-4777-8777-777777777777', title: 'Lunes 24', icon: '🗒️', parentId: '66666666-6666-4666-8666-666666666666', blocks: [b('l1', 'ul', 'Revisar el presupuesto')] }, 7),
          mk({ id: '88888888-8888-4888-8888-888888888888', title: 'Proyecto Racha', icon: '🔥', parentId: '55555555-5555-4555-8555-555555555555', blocks: [b('p1', 'p', 'Ideas y avances.')] }, 8),
        ];
    notas.notes.set(demoNotes);
    notas.loaded.set(true);
    (notas as unknown as { loading: Promise<void> }).loading = Promise.resolve();
    const find = (id: string) => notas.notes().find((n) => n.id === id);
    (notas as unknown as { rpc: (name: string) => Promise<unknown> }).rpc = async (name) => (name === 'note_move' ? 'ok' : undefined);
    notas.fetchOne = async (id) => find(id) ?? null;
    notas.acquire = async (id, force = false) => {
      const n = find(id);
      if (!n) return 'missing';
      if (notas.lockedByOther(n) && !force) return 'locked';
      notas.notes.update((l) => l.map((x) => (x.id === id ? { ...x, lockHolder: notas.holder, lockUntil: new Date(Date.now() + 45_000).toISOString() } : x)));
      return 'ok';
    };
    notas.release = async (id) => notas.notes.update((l) => l.map((x) => (x.id === id && x.lockHolder === notas.holder ? { ...x, lockHolder: null, lockUntil: null } : x)));
    notas.releaseOnExit = () => undefined;
    notas.save = async (id, title, blocks, icon = '') => {
      if (!find(id)) return 'missing';
      notas.notes.update((l) => l.map((x) => (x.id === id ? { ...x, title, blocks, icon, updatedAt: new Date().toISOString() } : x)));
      return 'ok';
    };
    notas.create = async (parentId = null) => {
      const n = mk({ id: crypto.randomUUID(), parentId, blocks: [b('n' + Date.now(), 'p', '')], sortOrder: 99 }, 0);
      notas.notes.update((l) => [n, ...l]);
      return n;
    };
    // Imágenes de la demo: una ilustración SVG en lugar del almacenamiento privado.
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320" viewBox="0 0 640 320"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2e5781"/><stop offset="1" stop-color="#f47b2a"/></linearGradient></defs><rect width="640" height="320" fill="url(#g)"/><circle cx="480" cy="110" r="54" fill="#ffffffcc"/><path d="M0 320 L170 150 L300 250 L420 170 L640 320 Z" fill="#0b0b0d55"/></svg>';
    const svgUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    notas.imageUrls.set({ 'demo/foto.svg': { url: svgUrl, exp: Date.now() + 1e12 } });
    notas.ensureImageUrls = async () => undefined;
    notas.uploadImage = async () => 'demo/foto.svg';
    notas.deleteImage = async () => undefined;
    notas.remove = async (id) => {
      const gone = new Set([id, ...notas.descendants(id).map((x) => x.id)]);
      notas.notes.update((l) => l.filter((x) => !gone.has(x.id)));
    };

    // Respaldo: en la demo no se lee de la base de datos; se arman las filas con los datos de ejemplo de arriba.
    {
      const filas: Record<string, Record<string, unknown>[]> = {
        notes: notas.notes().map((n) => ({
          id: n.id, title: n.title, icon: n.icon, parent_id: n.parentId, sort_order: n.sortOrder, pin_order: n.pinOrder, created_at: n.createdAt, updated_at: n.updatedAt, content: n.blocks,
        })),
        habits: DEFAULT_HABITS.map((h, i) => ({ key: h.k, name: h.name, when_text: h.when, position: i, active: true, group_id: null })),
        days: Object.entries(store.days()).map(([date, habits]) => ({ date, habits })),
        links: [{ title: 'Prep de entrevistas', url: 'https://interview-prepjm.netlify.app/', note: 'Preguntas, y "respuestas"', position: 0 }],
        badges: [{ name: 'Constante', kind: 'racha', target: 7, habit_key: null, active: true, position: 0 }],
        settings: [{ goal: 6, freeze_min: 15, active_days: [1, 2, 3, 4, 5] }],
      };
      const priv = respaldo as unknown as { leerTabla: (n: string) => Promise<unknown[]>; descargarImagenes: (i: { path: string; file: string }[], t: (i: { path: string; file: string }, b: Uint8Array | null) => Promise<void>, a: (n: number) => void) => Promise<void> };
      priv.leerTabla = async (n) => filas[n] ?? [];
      priv.descargarImagenes = async (imgs, termina, avanza) => {
        let k = 0;
        for (const img of imgs) {
          await termina(img, new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>'));
          avanza(++k);
        }
      };
    }

    auth.session.set({ user: { id: 'demo', email: 'demo@example.test' } } as Session);
        void router.navigateByUrl(new URLSearchParams(location.search).get('to') ?? '/');
      }, 600),
    );
  }
}
