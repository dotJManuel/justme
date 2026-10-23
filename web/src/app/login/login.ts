import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly registering = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly info = signal('');

  protected toggleMode() {
    this.registering.update((v) => !v);
    this.error.set('');
    this.info.set('');
  }

  protected async submit() {
    this.error.set('');
    this.info.set('');
    this.busy.set(true);
    try {
      if (this.registering()) {
        const { error, needsConfirmation } = await this.auth.signUp(this.email(), this.password());
        if (error) return this.error.set(error);
        if (needsConfirmation) {
          return this.info.set('Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.');
        }
      } else {
        const error = await this.auth.signIn(this.email(), this.password());
        if (error) return this.error.set(error);
      }
      await this.router.navigate(['/']);
    } finally {
      this.busy.set(false);
    }
  }
}
