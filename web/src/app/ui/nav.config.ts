import { IconName } from '../icons/icon';

export interface NavDestination {
  path: string;
  label: string;
  icon: IconName;
  /** Activo solo con la ruta exacta (Hoy es "/", que de otro modo siempre estaría activo). */
  exact?: boolean;
}

/** Cinco destinos: Hoy · Racha · Notas · [+ Agregar] · Finanzas · Perfil. El "+" no es una ruta: abre la hoja de captura. */
export const NAV_BEFORE_ADD: NavDestination[] = [
  { path: '/', label: 'Hoy', icon: 'home', exact: true },
  { path: '/racha', label: 'Racha', icon: 'flame' },
  { path: '/notas', label: 'Notas', icon: 'file-text' },
];
export const NAV_AFTER_ADD: NavDestination[] = [
  { path: '/finanzas', label: 'Finanzas', icon: 'wallet' },
  { path: '/perfil', label: 'Perfil', icon: 'user' },
];

