import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../auth.service';

/** Menú principal: se ve en todas las pantallas cuando hay sesión. */
@Component({
  selector: 'app-nav',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './nav.html',
  styleUrl: './nav.css',
})
export class Nav {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected async signOut() {
    await this.auth.signOut();
    await this.router.navigate(['/login']);
  }
}
