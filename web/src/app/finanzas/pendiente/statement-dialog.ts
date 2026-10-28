import { AfterViewInit, Component, ElementRef, OnDestroy, computed, input, output, signal, viewChild } from '@angular/core';
import { dateKey } from '../../habits/streaks';
import { Statement, statementText } from '../finanzas.statement';
import { safeFileName } from '../xlsx';
import { drawStatement } from './statement-canvas';
import { Icon } from '../../icons/icon';
import { Button } from '../../ui/button';
import { Skeleton } from '../../ui/states';

/**
 * Ventana con el estado de cuenta de una persona, dibujado como hoja de Excel, listo para mandar por WhatsApp:
 * compartir la imagen (en el celular abre la hoja de compartir), mandar el texto o descargar la imagen.
 */
@Component({
  imports: [Button, Icon, Skeleton],
  selector: 'app-statement-dialog',
  templateUrl: './statement-dialog.html',
  styleUrl: './statement-dialog.css',
})
export class StatementDialog implements AfterViewInit, OnDestroy {
  readonly statement = input.required<Statement>();
  readonly closed = output<void>();

  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  protected readonly imageUrl = signal('');
  protected readonly busy = signal(true);
  protected readonly message = signal('');

  protected readonly text = computed(() => statementText(this.statement()));
  private readonly fileName = computed(
    () => `${safeFileName(`Estado de cuenta ${this.statement().person} ${dateKey(this.statement().asOf)}`)}.png`,
  );
  private blob: Blob | null = null;
  private finished = false;

  async ngAfterViewInit() {
    this.dlg().nativeElement.showModal();
    try {
      // La imagen usa las tipografías de la página: se espera a que estén listas para que no salga con otra letra.
      await document.fonts?.ready;
      const canvas = drawStatement(this.statement());
      this.blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (this.blob) this.imageUrl.set(URL.createObjectURL(this.blob));
      else this.message.set('No se pudo preparar la imagen. Puedes mandar el texto.');
    } catch {
      this.message.set('No se pudo preparar la imagen. Puedes mandar el texto.');
    } finally {
      this.busy.set(false);
    }
  }

  ngOnDestroy() {
    if (this.imageUrl()) URL.revokeObjectURL(this.imageUrl());
  }

  protected close() {
    this.dlg().nativeElement.close();
    this.finish();
  }

  /**
   * Avisa una sola vez que se cerró (con ✕, tocando fuera o con Esc). No se depende solo del evento "close" del
   * navegador: hay navegadores que no lo disparan a tiempo y la ventana se quedaba "abierta" para la app.
   */
  protected finish() {
    if (this.finished) return;
    this.finished = true;
    this.closed.emit();
  }

  /** Un clic en el fondo oscuro (fuera de la tarjeta) cierra la ventana. */
  protected onBackdrop(e: MouseEvent) {
    if (e.target === this.dlg().nativeElement) this.close();
  }

  /** Abre la hoja de compartir del celular con la imagen (ahí se elige WhatsApp). Si no se puede, descarga la imagen. */
  protected async shareImage() {
    if (!this.blob) return;
    const file = new File([this.blob], this.fileName(), { type: 'image/png' });
    const s = this.statement();
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `Estado de cuenta de ${s.person}` });
        return;
      } catch (e) {
        if ((e as DOMException).name === 'AbortError') return; // cerró la hoja de compartir
      }
    }
    this.download();
    this.message.set('Este navegador no puede compartir imágenes directo: se descargó la imagen para que la adjuntes en el chat.');
  }

  protected download() {
    if (!this.imageUrl()) return;
    const a = document.createElement('a');
    a.href = this.imageUrl();
    a.download = this.fileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /** Abre WhatsApp con el resumen escrito; allí eliges a quién mandarlo. */
  protected whatsapp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(this.text())}`, '_blank', 'noopener');
  }

  protected async copy() {
    const ok = (await this.writeClipboard()) || this.copyLegacy();
    this.message.set(ok ? 'Texto copiado: pégalo en el chat.' : 'No se pudo copiar. Usa «Texto por WhatsApp».');
  }

  private async writeClipboard(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(this.text());
      return true;
    } catch {
      return false;
    }
  }

  /** Plan B para navegadores sin portapapeles moderno o sin permiso: un campo oculto y "copiar" del sistema. */
  private copyLegacy(): boolean {
    const area = document.createElement('textarea');
    area.value = this.text();
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    this.dlg().nativeElement.appendChild(area);
    area.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      area.remove();
    }
  }
}
