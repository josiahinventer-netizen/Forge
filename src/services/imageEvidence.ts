export const MAX_EVIDENCE_DATA_URL_LENGTH = 450_000;

const canvasBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('The browser could not encode this image.')),
      'image/jpeg',
      quality,
    ),
  );

const blobDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The browser could not read this image.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });

export async function prepareEvidenceImage(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  if (file.size > 25_000_000) throw new Error('The original image must be smaller than 25 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The browser cannot resize images on this device.');
    context.drawImage(bitmap, 0, 0, width, height);
    let blob = await canvasBlob(canvas, 0.72);
    let dataUrl = await blobDataUrl(blob);
    if (dataUrl.length > MAX_EVIDENCE_DATA_URL_LENGTH) {
      blob = await canvasBlob(canvas, 0.5);
      dataUrl = await blobDataUrl(blob);
    }
    if (dataUrl.length > MAX_EVIDENCE_DATA_URL_LENGTH)
      throw new Error(
        'The resized image is still too detailed. Try a closer photo of the item or label.',
      );
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    const sha256 = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    return { dataUrl, byteSize: blob.size, width, height, sha256, mimeType: 'image/jpeg' as const };
  } finally {
    bitmap.close();
  }
}
