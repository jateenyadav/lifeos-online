/** Receipt and old-khata photos are shrunk on the device before upload (≤ 1600 px, JPEG). */
export const MAX_SIDE = 1600;

export function fitSize(width, height, max = MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall back to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Returns { mime, data (base64, no prefix), width, height }. */
export async function downscaleImage(file, max = MAX_SIDE) {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type || ''))
    throw new Error('Choose a JPEG, PNG or WebP picture.');
  const image = await decode(file);
  const { width, height } = fitSize(image.width, image.height, max);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  image.close?.();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.84);
  const data = dataUrl.slice(dataUrl.indexOf(',') + 1);
  if (data.length * 0.75 > 1.5 * 1024 * 1024)
    throw new Error(
      'This picture is still too large after shrinking. Try a smaller one.',
    );
  return { mime: 'image/jpeg', data, width, height };
}
