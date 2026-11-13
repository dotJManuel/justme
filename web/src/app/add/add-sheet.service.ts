import { Injectable, signal } from '@angular/core';

/** Un gasto que ya repites: sirve para abrir el formulario con todo ya escrito. */
export interface FrequentExpense {
  concept: string;
  amount: number;
  /** Id de la tarjeta o "fijos". */
  dest: string;
}

export interface AddPreset {
  tab?: 'gasto' | 'prestamo' | 'familia';
  /** Persona ya elegida (desde su ficha). */
  personId?: string;
  /** Préstamo (cargo) o pago (abono). */
  kind?: 'cargo' | 'abono';
  /** Gasto repetido: concepto, monto y destino ya escritos. */
  expense?: FrequentExpense;
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
