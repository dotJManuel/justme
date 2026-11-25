import { Injectable, signal } from '@angular/core';

const TREE_KEY = 'justme.notas.tree';
const OPEN_KEY = 'justme.notas.expanded';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sin almacenamiento: solo no se recuerda */
  }
}

/** Estado de la navegación de notas: si el árbol lateral está a la vista y qué notas están expandidas (se recuerdan en este dispositivo). */
@Injectable({ providedIn: 'root' })
export class NotasNav {
  /** Árbol lateral visible en escritorio. */
  readonly treeOpen = signal(read<boolean>(TREE_KEY, true));
  /** El árbol abierto como hoja en el celular. */
  readonly drawerOpen = signal(false);
  /** Ids de las notas cuyas subpáginas se ven desplegadas. */
  readonly expanded = signal<ReadonlySet<string>>(new Set(read<string[]>(OPEN_KEY, [])));

  toggleTree() {
    this.treeOpen.update((v) => !v);
    write(TREE_KEY, this.treeOpen());
  }

  toggle(id: string) {
    const next = new Set(this.expanded());
    if (!next.delete(id)) next.add(id);
    this.set(next);
  }

  expand(...ids: string[]) {
    const cur = this.expanded();
    if (ids.every((id) => cur.has(id))) return;
    this.set(new Set([...cur, ...ids]));
  }

  private set(next: Set<string>) {
    this.expanded.set(next);
    write(OPEN_KEY, [...next]);
  }
}
