import { ChangeDetectionStrategy, Component, computed, input, model, output, signal } from '@angular/core';
import { BottomSheet } from '../ui/bottom-sheet';
import { Button } from '../ui/button';
import { EMOJI_CATEGORIES, EmojiEntry, entriesOf, searchEmoji } from './emoji.data';

const RECENT_KEY = 'justme.emoji.recent';
const RECENT_MAX = 16;

function loadRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

/**
 * Selector de emoji: hoja inferior en móvil y modal en escritorio, con buscador por nombre en español, categorías y los
 * usados hace poco. `clearable` agrega «Quitar» (para el ícono de una página). Emite `picked` con el emoji elegido.
 */
@Component({
  selector: 'app-emoji-picker',
  imports: [BottomSheet, Button],
  template: `
    <ui-bottom-sheet [title]="title()" [(open)]="open">
      <div class="wrap">
        <input
          type="search" class="q" placeholder="Buscar emoji (ej. fuego, casa, libro)" aria-label="Buscar emoji" autocomplete="off"
          [value]="query()" (input)="query.set($any($event.target).value)"
        />
        @if (query().trim()) {
          <div class="grid" role="listbox" aria-label="Resultados">
            @for (e of found(); track e.char) {
              <button type="button" role="option" class="em" [attr.aria-label]="e.words" (click)="pick(e.char)">{{ e.char }}</button>
            } @empty {
              <p class="none">Sin resultados</p>
            }
          </div>
        } @else {
          <div class="tabs" role="tablist" aria-label="Categorías">
            @if (recent().length) {
              <button type="button" role="tab" class="tab" [class.on]="cat() === 'recientes'" [attr.aria-selected]="cat() === 'recientes'" aria-label="Recientes" (click)="cat.set('recientes')">🕘</button>
            }
            @for (c of categories; track c.id) {
              <button type="button" role="tab" class="tab" [class.on]="cat() === c.id" [attr.aria-selected]="cat() === c.id" [attr.aria-label]="c.label" (click)="cat.set(c.id)">{{ c.icon }}</button>
            }
          </div>
          <div class="grid" role="listbox" [attr.aria-label]="catLabel()">
            @for (e of shown(); track e.char) {
              <button type="button" role="option" class="em" [attr.aria-label]="e.words" (click)="pick(e.char)">{{ e.char }}</button>
            }
          </div>
        }
        @if (clearable()) {
          <button uiBtn variant="secondary" type="button" (click)="pick('')">Quitar emoji</button>
        }
      </div>
    </ui-bottom-sheet>
  `,
  styles: `
    .wrap { display: flex; flex-direction: column; gap: 12px; }
    .q { height: var(--touch); padding: 0 12px; border: 1px solid var(--bd2); border-radius: var(--rf-2); background: var(--sf); color: var(--tx); font: inherit; font-size: 15px; }
    .tabs { display: flex; gap: 4px; overflow-x: auto; padding-bottom: 2px; }
    .tab { flex: none; width: 40px; height: 40px; border: 0; border-radius: 10px; background: none; font-size: 20px; cursor: pointer; filter: grayscale(0.6); }
    .tab:hover { background: var(--s2); }
    .tab.on { background: var(--acs); filter: none; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(44px, 1fr)); gap: 2px; max-height: 280px; overflow-y: auto; }
    .em { display: grid; place-items: center; height: 44px; border: 0; border-radius: 10px; background: none; font-size: 26px; line-height: 1; cursor: pointer; }
    .em:hover, .em:focus-visible { background: var(--s2); }
    .none { grid-column: 1 / -1; padding: 16px 0; text-align: center; color: var(--tx2); font-size: 14px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmojiPicker {
  readonly open = model(false);
  readonly title = input('Elegir emoji');
  readonly clearable = input(false);
  readonly picked = output<string>();

  protected readonly categories = EMOJI_CATEGORIES;
  protected readonly query = signal('');
  protected readonly cat = signal<string>(EMOJI_CATEGORIES[0].id);
  protected readonly recent = signal<string[]>(loadRecent());

  protected readonly found = computed(() => searchEmoji(this.query()));
  protected readonly catLabel = computed(() => (this.cat() === 'recientes' ? 'Recientes' : (this.categories.find((c) => c.id === this.cat())?.label ?? '')));
  protected readonly shown = computed<EmojiEntry[]>(() => {
    if (this.cat() === 'recientes') return this.recent().map((char) => ({ char, words: 'reciente' }));
    const c = this.categories.find((x) => x.id === this.cat()) ?? this.categories[0];
    return entriesOf(c);
  });

  protected pick(char: string) {
    if (char) {
      const next = [char, ...this.recent().filter((x) => x !== char)].slice(0, RECENT_MAX);
      this.recent.set(next);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* sin almacenamiento: solo no se recuerdan */
      }
    }
    this.query.set('');
    this.open.set(false);
    this.picked.emit(char);
  }
}
