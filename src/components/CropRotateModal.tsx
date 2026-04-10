import Cropper from 'react-easy-crop';
import { useCallback, useMemo, useState } from 'react';
import { RotateCcw, RotateCw, X } from 'lucide-react';
import { getCroppedImageDataUrl } from '../lib/imageEdit';

type Area = { x: number; y: number; width: number; height: number };

export function CropRotateModal({
  title = 'Edit photo',
  imageSrc,
  open,
  busy,
  onCancel,
  onConfirm,
}: {
  title?: string;
  imageSrc: string;
  open: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => Promise<void> | void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [error, setError] = useState('');

  const previewSrc = useMemo(() => imageSrc, [imageSrc]);

  const onCropComplete = useCallback((_area: any, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleConfirm = useCallback(async () => {
    setError('');
    if (!croppedAreaPixels) {
      setError('Please adjust the crop first.');
      return;
    }
    try {
      const dataUrl = await getCroppedImageDataUrl({
        imageSrc: previewSrc,
        areaPixels: croppedAreaPixels,
        rotation,
        outputSize: 512,
        quality: 0.85,
      });
      await onConfirm(dataUrl);
    } catch (e: any) {
      setError(e?.message || 'Failed to process image.');
    }
  }, [croppedAreaPixels, onConfirm, previewSrc, rotation]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => !busy && onCancel()}
      />

      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden my-6 max-h-[calc(100vh-2rem)]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="font-semibold text-slate-900">{title}</div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-60"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          <div className="relative w-full h-[280px] sm:h-[320px] bg-slate-900 rounded-xl overflow-hidden">
            <Cropper
              image={previewSrc}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={onCropComplete}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-slate-500 mb-2">Zoom</div>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full"
                disabled={busy}
              />
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-2">Rotate</div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
                    disabled={busy}
                    className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-60 flex items-center gap-2 text-sm"
                  >
                    <RotateCcw className="w-4 h-4" />
                    -90°
                  </button>
                  <button
                    type="button"
                    onClick={() => setRotation((r) => (r + 90) % 360)}
                    disabled={busy}
                    className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-60 flex items-center gap-2 text-sm"
                  >
                    <RotateCw className="w-4 h-4" />
                    +90°
                  </button>
                </div>
                <div className="text-xs text-slate-500 self-start">Current: {rotation}°</div>
              </div>
            </div>
          </div>

          {error && <div className="mt-3 text-xs text-red-600">{error}</div>}
          <div className="mt-5 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-60 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 text-sm font-medium"
            >
              {busy ? 'Saving…' : 'Save photo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

