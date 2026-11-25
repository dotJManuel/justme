/** Preparar una imagen antes de subirla: se reduce y se comprime para que pese poco (el límite del almacenamiento es 5 MB). */

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Lado más largo, en píxeles, al que se reduce una foto. */
export const MAX_IMAGE_SIDE = 1600;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export interface PreparedImage {
  blob: Blob;
  /** Extensión sin punto (jpg, png, webp, gif). */
  ext: string;
  type: string;
}

/** Error con un mensaje listo para mostrar. */
export class ImageError extends Error {}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

/** Tamaño al que se reduce (sin agrandar nunca) manteniendo la proporción. */
export function fitSize(w: number, h: number, max = MAX_IMAGE_SIDE): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, quality));

/**
 * Devuelve la imagen lista para subir. Los GIF (animados) se suben tal cual; el resto se reduce a un máximo de
 * 1600 px y se guarda como WebP (o JPEG si el navegador no sabe). Lanza `ImageError` si no es una imagen válida o pesa
 * demasiado.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!IMAGE_TYPES.includes(file.type)) throw new ImageError('Ese archivo no es una imagen compatible (JPG, PNG, WebP o GIF).');
  if (file.type === 'image/gif') {
    if (file.size > MAX_IMAGE_BYTES) throw new ImageError('El GIF pesa más de 5 MB.');
    return { blob: file, ext: 'gif', type: file.type };
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageError('No se pudo leer la imagen.');
  }
  try {
    const { w, h } = fitSize(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new ImageError('No se pudo procesar la imagen.');
    ctx.drawImage(bitmap, 0, 0, w, h);
    let blob = await toBlob(canvas, 'image/webp', 0.85);
    // Un navegador sin WebP devuelve PNG: se prefiere JPEG, que pesa mucho menos.
    if (!blob || blob.type !== 'image/webp') {
      const white = document.createElement('canvas');
      white.width = w;
      white.height = h;
      const c2 = white.getContext('2d');
      if (c2) {
        c2.fillStyle = '#ffffff';
        c2.fillRect(0, 0, w, h);
        c2.drawImage(canvas, 0, 0);
        blob = await toBlob(white, 'image/jpeg', 0.85);
      }
    }
    if (!blob) throw new ImageError('No se pudo procesar la imagen.');
    if (blob.size > MAX_IMAGE_BYTES) throw new ImageError('La imagen pesa más de 5 MB aun reducida.');
    return { blob, ext: EXT[blob.type] ?? 'jpg', type: blob.type };
  } finally {
    bitmap.close();
  }
}
