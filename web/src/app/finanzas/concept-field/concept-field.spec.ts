import { Concept } from '../finanzas.models';
import { resolveConcept } from './concept-field';

const OPTIONS: Concept[] = [
  { id: 'k1', scope: 'gasto', name: 'Netflix', active: true },
  { id: 'k2', scope: 'gasto', name: 'Disney', active: false },
];

describe('resolveConcept', () => {
  it('si lo escrito coincide con un concepto activo, se enlaza al catálogo (sin importar mayúsculas)', () => {
    expect(resolveConcept(OPTIONS, '  netflix ')).toEqual({ id: 'k1', text: '' });
  });

  it('si no coincide con ninguno, queda como texto libre recortado', () => {
    expect(resolveConcept(OPTIONS, '  Tamales de la esquina ')).toEqual({ id: null, text: 'Tamales de la esquina' });
  });

  it('un concepto desactivado no se enlaza (queda como texto)… salvo que el registro ya lo tuviera', () => {
    expect(resolveConcept(OPTIONS, 'Disney')).toEqual({ id: null, text: 'Disney' });
    expect(resolveConcept(OPTIONS, 'Disney', 'k2')).toEqual({ id: 'k2', text: '' });
  });

  it('vacío significa sin concepto', () => {
    expect(resolveConcept(OPTIONS, '   ')).toEqual({ id: null, text: '' });
  });
});
