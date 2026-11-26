import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Icon } from '../icons/icon';
import { BottomSheet } from '../ui/bottom-sheet';
import { NotesTree } from './notas-tree';
import { NotasNav } from './notas.nav';

/**
 * Marco de Notas: en escritorio, el árbol de notas en una barra lateral (que se puede ocultar) y la pantalla al lado; en el
 * celular, el árbol se abre como hoja desde el botón de la lista y de cada nota.
 */
@Component({
  selector: 'app-notas-shell',
  imports: [BottomSheet, Icon, NotesTree, RouterOutlet],
  template: `
    <div class="wrap">
      @if (nav.treeOpen()) {
        <aside class="tree" aria-label="Árbol de docs">
          <app-notes-tree [collapsible]="true" (collapse)="nav.toggleTree()" />
        </aside>
      }
      <div class="content">
        @if (!nav.treeOpen()) {
          <button type="button" class="reveal" aria-label="Mostrar el árbol de docs" (click)="nav.toggleTree()"><app-icon name="sidebar" [size]="18" /></button>
        }
        <router-outlet />
      </div>
    </div>

    <ui-bottom-sheet title="Docs" [(open)]="nav.drawerOpen">
      @if (nav.drawerOpen()) {
        <app-notes-tree />
      }
    </ui-bottom-sheet>
  `,
  styles: `
    :host { display: block; }
    .wrap { display: flex; align-items: flex-start; }
    .content { position: relative; flex: 1; min-width: 0; }
    .tree, .reveal { display: none; }
    @media (min-width: 1024px) {
      .tree {
        display: block; position: sticky; top: 0; flex: none; width: 280px; height: 100dvh; padding: var(--sp-3) var(--sp-2); overflow-y: auto;
        background: var(--sf); box-shadow: inset -1px 0 0 var(--bd); overscroll-behavior: contain;
      }
      .reveal {
        position: absolute; top: var(--sp-3); left: var(--sp-3); z-index: 5; display: grid; place-items: center; width: 36px; height: 36px; border: 0; border-radius: 8px;
        background: var(--sf); color: var(--tx2); box-shadow: var(--sh1), inset 0 0 0 1px var(--bd); cursor: pointer;
      }
      .reveal:hover { background: var(--s2); color: var(--tx); }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotasShell {
  protected readonly nav = inject(NotasNav);
}
