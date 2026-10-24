import { buildXlsx, colName, crc32, safeFileName, serial, sheetNames } from './xlsx';

/** Lee un zip sin compresión (el que arma buildXlsx) y devuelve sus archivos, comprobando los CRC. */
function unzip(bytes: Uint8Array): Record<string, string> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dec = new TextDecoder();
  const end = bytes.length - 22;
  expect(v.getUint32(end, true)).toBe(0x06054b50);
  const entries = v.getUint16(end + 10, true);
  let pos = v.getUint32(end + 16, true);
  const out: Record<string, string> = {};
  for (let i = 0; i < entries; i++) {
    expect(v.getUint32(pos, true)).toBe(0x02014b50);
    const crc = v.getUint32(pos + 16, true);
    const size = v.getUint32(pos + 24, true);
    const nameLen = v.getUint16(pos + 28, true);
    const local = v.getUint32(pos + 42, true);
    const name = dec.decode(bytes.subarray(pos + 46, pos + 46 + nameLen));
    expect(v.getUint32(local, true)).toBe(0x04034b50);
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    expect(crc32(data)).toBe(crc);
    out[name] = dec.decode(data);
    pos += 46 + nameLen;
  }
  return out;
}

const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');

describe('xlsx', () => {
  const files = unzip(
    buildXlsx([
      {
        name: 'Gastos',
        columns: [
          { header: 'Concepto' },
          { header: 'Monto', type: 'money' },
          { header: 'Fecha', type: 'date' },
        ],
        rows: [
          ['Netflix & "Disney" <combo>', 348, new Date(2026, 0, 1)],
          ['Sin monto', null, null],
        ],
        total: ['Total', 348, null],
      },
      { name: 'Vacía', columns: [{ header: 'A' }], rows: [] },
    ]),
  );

  it('trae las partes que Excel exige y todas son XML válido', () => {
    for (const name of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) {
      expect(files[name], name).toBeDefined();
      expect(parse(files[name]).querySelector('parsererror'), name).toBeNull();
    }
  });

  it('escapa el texto y guarda números, fechas y totales', () => {
    const sheet = parse(files['xl/worksheets/sheet1.xml']);
    const cell = (ref: string) => sheet.querySelector(`c[r="${ref}"]`);
    expect(cell('A2')?.textContent).toBe('Netflix & "Disney" <combo>');
    expect(cell('B2')?.querySelector('v')?.textContent).toBe('348');
    expect(cell('C2')?.querySelector('v')?.textContent).toBe('46023'); // 1 ene 2026
    expect(cell('B3')).toBeNull(); // una celda vacía no se escribe
    expect(cell('A4')?.textContent).toBe('Total'); // fila de totales, después de los datos
    expect(sheet.querySelector('autoFilter')?.getAttribute('ref')).toBe('A1:C3'); // el filtro no incluye el total
  });

  it('el libro lista las hojas con su nombre', () => {
    const names = [...parse(files['xl/workbook.xml']).querySelectorAll('sheet')].map((s) => s.getAttribute('name'));
    expect(names).toEqual(['Gastos', 'Vacía']);
  });
});

describe('utilidades de xlsx', () => {
  it('números de serie de Excel', () => {
    expect(serial(new Date(2026, 0, 1))).toBe(46023);
    expect(serial(new Date(2000, 0, 1))).toBe(36526);
    expect(serial(new Date(2026, 0, 1, 12, 0))).toBe(46023.5);
  });

  it('nombres de columna', () => {
    expect([0, 1, 25, 26, 27].map(colName)).toEqual(['A', 'B', 'Z', 'AA', 'AB']);
  });

  it('nombres de hoja válidos y sin repetirse', () => {
    expect(sheetNames(['Gastos/2026: [x]', 'gastos/2026: [x]', '', 'a'.repeat(40)])).toEqual([
      'Gastos 2026 x',
      'gastos 2026 x (2)',
      'Hoja',
      'a'.repeat(31),
    ]);
  });

  it('nombres de archivo sin caracteres prohibidos', () => {
    expect(safeFileName('Tarjeta / BBVA: "2026"')).toBe('Tarjeta BBVA 2026');
  });
});
