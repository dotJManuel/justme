import { Injectable, computed, inject, signal } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import { ConfigService } from './config.service';
import { FinanzasService } from './finanzas/finanzas.service';
import { HabitsStore } from './habits/habits.store';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(SupabaseService).client.auth;
  private readonly config = inject(ConfigService);
  private readonly finanzas = inject(FinanzasService);
  private readonly habits = inject(HabitsStore);

  readonly session = signal<Session | null>(null);
  readonly user = computed(() => this.session()?.user ?? null);

  /** Se resuelve cuando ya sabemos si hay una sesión guardada (los guards la esperan). */
  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.auth.getSession().then(({ data }) => this.session.set(data.session));
    this.auth.onAuthStateChange((event, session) => {
      // Los ajustes y las finanzas son de cada usuario: no deben quedar en memoria al cambiar de cuenta.
      if (event === 'SIGNED_OUT') {
        this.config.reset();
        this.finanzas.reset();
        this.habits.reset();
      }
      this.session.set(session);
    });
  }

  /** Devuelve un mensaje de error en español, o null si todo salió bien. */
  async signIn(email: string, password: string): Promise<string | null> {
    const { error } = await this.auth.signInWithPassword({ email, password });
    return error ? this.translate(error.message) : null;
  }

  /** needsConfirmation = true cuando Supabase exige confirmar el correo antes de entrar. */
  async signUp(
    email: string,
    password: string,
  ): Promise<{ error: string | null; needsConfirmation: boolean }> {
    const { data, error } = await this.auth.signUp({ email, password });
    if (error) return { error: this.translate(error.message), needsConfirmation: false };
    return { error: null, needsConfirmation: !data.session };
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
  }

  private translate(message: string): string {
    const m = message.toLowerCase();
    if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
    if (m.includes('already registered')) return 'Ese correo ya tiene una cuenta.';
    if (m.includes('password should be at least')) return 'La contraseña debe tener al menos 6 caracteres.';
    if (m.includes('email not confirmed')) return 'Confirma tu correo antes de entrar.';
    if (m.includes('rate limit')) return 'Demasiados intentos. Espera un momento.';
    return 'No se pudo completar. Intenta de nuevo.';
  }
}
