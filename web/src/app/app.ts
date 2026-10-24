import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './auth.service';
import { Nav } from './nav/nav';

@Component({
  imports: [RouterOutlet, Nav],
  selector: 'app-root',
  template: `
    @if (auth.session()) {
      <app-nav />
    }
    <router-outlet />
  `,
})
export class App {
  protected readonly auth = inject(AuthService);
}
