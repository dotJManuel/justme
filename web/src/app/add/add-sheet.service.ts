import { Injectable, signal } from '@angular/core';

export interface AddPreset {
  tab?: 'gasto' | 'prestamo' | 'familia';
  /** Persona ya elegida (desde su ficha). */
  personId?: string;
  /** Préstamo (cargo) o pago (abono). */
  kind?: 'cargo' | 'abono';
}

/** Abre la hoja "+" desde cualquier pantalla, con algo ya elegido (por ejemplo, "Registrar pago" de una persona). */
@Injectable({ providedIn: 'root' })
export class AddSheetService {
  readonly open = signal(false);
  readonly preset = signal<AddPreset>({});

  show(preset: AddPreset = {}) {
    this.preset.set(preset);
    this.open.set(true);
  }
}
