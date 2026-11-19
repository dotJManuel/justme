import { IconName } from '../icons/icon';

export interface NavDestination {
  path: string;
  label: string;
  icon: IconName;
  /** Activo solo con la ruta exacta (Hoy es "/", que de otro modo siempre estaría activo). */
  exact?: boolean;
  /** Solo en la barra lateral: en móvil se llega con el botón de usuario de la barra superior. */
  desktopOnly?: boolean;
}

/**
 * Escritorio: Hoy · Racha · Notas · Finanzas · Perfil. Móvil: Hoy · Racha · [+ Agregar] · Notas · Finanzas, con el "+"
 * justo al centro. El "+" no es una ruta: abre la hoja de captura.
 */
export const NAV_BEFORE_ADD: NavDestination[] = [
  { path: '/', label: 'Hoy', icon: 'home', exact: true },
  { path: '/racha', label: 'Racha', icon: 'flame' },
];
export const NAV_AFTER_ADD: NavDestination[] = [
  { path: '/notas', label: 'Notas', icon: 'file-text' },
  { path: '/finanzas', label: 'Finanzas', icon: 'wallet' },
  { path: '/perfil', label: 'Perfil', icon: 'user', desktopOnly: true },
];
