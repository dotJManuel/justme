import { Component, OnInit, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FinanzasService } from './finanzas.service';

/** Contenedor del módulo: pestañas Gastos / Pendiente y carga de datos una sola vez. */
@Component({
  selector: 'app-finanzas-page',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './finanzas-page.html',
  styleUrl: './finanzas-page.css',
})
export class FinanzasPage implements OnInit {
  protected readonly fin = inject(FinanzasService);

  ngOnInit() {
    // El mensaje de error ya queda en el servicio.
    this.fin.load().catch(() => undefined);
  }
}
