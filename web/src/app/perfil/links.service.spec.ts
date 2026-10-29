import { describe, expect, it } from 'vitest';
import { normalizeUrl } from './links.service';

describe('normalizeUrl', () => {
  it('deja las direcciones completas como están', () => {
    expect(normalizeUrl('https://interview-prepjm.netlify.app/')).toBe('https://interview-prepjm.netlify.app/');
    expect(normalizeUrl('http://ejemplo.com/ruta?x=1')).toBe('http://ejemplo.com/ruta?x=1');
  });

  it('sin esquema asume https y recorta espacios', () => {
    expect(normalizeUrl('  ejemplo.com ')).toBe('https://ejemplo.com/');
    expect(normalizeUrl('www.ejemplo.com/a')).toBe('https://www.ejemplo.com/a');
  });

  it('rechaza lo que no es una dirección web', () => {
    expect(normalizeUrl('')).toBeNull();
    expect(normalizeUrl('hola mundo')).toBeNull();
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('ftp://ejemplo.com')).toBeNull();
    expect(normalizeUrl('localhost')).toBeNull();
  });
});
