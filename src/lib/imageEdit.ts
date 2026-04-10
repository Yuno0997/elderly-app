type Area = { x: number; y: number; width: number; height: number };

function createImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image'));
    image.src = url;
  });
}

function getRadianAngle(degreeValue: number) {
  return (degreeValue * Math.PI) / 180;
}

function rotateSize(width: number, height: number, rotation: number) {
  const rotRad = getRadianAngle(rotation);
  return {
    width: Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height: Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  };
}

/**
 * Returns a JPEG data URL of the cropped/rotated image.
 * - `rotation`: degrees
 * - `areaPixels`: crop area in the image's pixel coordinate space (from react-easy-crop)
 */
export async function getCroppedImageDataUrl({
  imageSrc,
  areaPixels,
  rotation = 0,
  outputSize = 512,
  quality = 0.85,
}: {
  imageSrc: string;
  areaPixels: Area;
  rotation?: number;
  outputSize?: number;
  quality?: number;
}) {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  const rotRad = getRadianAngle(rotation);
  const { width: bBoxWidth, height: bBoxHeight } = rotateSize(image.width, image.height, rotation);

  canvas.width = bBoxWidth;
  canvas.height = bBoxHeight;

  ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
  ctx.rotate(rotRad);
  ctx.translate(-image.width / 2, -image.height / 2);
  ctx.drawImage(image, 0, 0);

  const croppedCanvas = document.createElement('canvas');
  const croppedCtx = croppedCanvas.getContext('2d');
  if (!croppedCtx) throw new Error('Canvas not supported');

  croppedCanvas.width = outputSize;
  croppedCanvas.height = outputSize;

  // draw crop area into square output canvas
  // areaPixels refer to original image space BEFORE rotation; but react-easy-crop provides
  // pixel area relative to the rotated image drawn in its internal canvas. To keep behavior
  // aligned, we crop from the rotated bounding-box canvas using the provided area.
  croppedCtx.drawImage(
    canvas,
    areaPixels.x,
    areaPixels.y,
    areaPixels.width,
    areaPixels.height,
    0,
    0,
    outputSize,
    outputSize
  );

  return croppedCanvas.toDataURL('image/jpeg', quality);
}

