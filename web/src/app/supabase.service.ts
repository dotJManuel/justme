import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../environments/environment';

// Misiones marcadas de un día: { leetcode: "2026-10-23T14:15:03.000Z", ingles: true, ... }
// El valor es la hora (ISO) en que se dio el check; `true` es una marca antigua sin hora.
export type Habits = Record<string, boolean | string>;

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient = createClient(
    environment.supabaseUrl,
    environment.supabaseKey,
  );

  /** Todos los días del usuario con sesión: { "2026-10-22": {...} } */
  async loadDays(): Promise<Record<string, Habits>> {
    const { data, error } = await this.client.from('days').select('date, habits');
    if (error) throw error;
    return Object.fromEntries((data ?? []).map((r) => [r.date, r.habits as Habits]));
  }

  /** Guarda (inserta o actualiza) un día. user_id lo pone la base de datos. */
  async saveDay(date: string, habits: Habits): Promise<void> {
    const { error } = await this.client
      .from('days')
      .upsert({ date, habits, updated_at: new Date().toISOString() }, { onConflict: 'user_id,date' });
    if (error) throw error;
  }
}
