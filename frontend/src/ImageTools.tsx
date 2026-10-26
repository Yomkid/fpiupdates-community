import { useEffect, useRef, useState } from 'react';
import { Modal } from './components';
import { ZoomIn, ZoomOut } from 'lucide-react';
export function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(false);
  return (
    <Modal title={alt || 'Image'} wide onClose={onClose}>
      <div className={'image-lightbox ' + (zoom ? 'image-zoomed' : '')}>
        <button
          className="image-zoom-toggle icon-button"
          onClick={() => setZoom((v) => !v)}
          aria-label={zoom ? 'Fit image' : 'Zoom image'}
        >
          {zoom ? <ZoomOut /> : <ZoomIn />}
        </button>
        <img src={src} alt={alt} onClick={() => setZoom((v) => !v)} />
      </div>
    </Modal>
  );
}
export function ViewImage({
  src,
  alt,
  className = '',
  loading = 'lazy',
}: {
  src: string;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="image-view-trigger"
        type="button"
        aria-label={'View ' + (alt || 'image')}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <img className={className} src={src} alt={alt} loading={loading} />
      </button>
      {open && <ImageLightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}
export function CropImage({
  src,
  aspect = 1,
  label,
  onCancel,
  onDone,
}: {
  src: string;
  aspect?: number;
  label: string;
  onCancel: () => void;
  onDone: (file: File) => Promise<void> | void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(50),
    [y, setY] = useState(50);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  useEffect(() => {
    let active = true;
    const img = new Image();
    img.crossOrigin = 'use-credentials';
    img.onload = () => {
      if (!active) return;
      if (img.naturalWidth * img.naturalHeight > 16_000_000) {
        setError('Choose an image up to 16 megapixels.');
        return;
      }
      setImage(img);
    };
    img.onerror = () => {
      if (active) setError('This image could not be opened. Try another image.');
    };
    img.src = src;
    return () => {
      active = false;
      img.onload = null;
      img.onerror = null;
    };
  }, [src]);
  useEffect(() => {
    if (!image || !canvas.current) return;
    const out = canvas.current;
    out.width = aspect === 1 ? 512 : 1500;
    out.height = Math.round(out.width / aspect);
    const scale = Math.max(out.width / image.naturalWidth, out.height / image.naturalHeight) * zoom;
    const w = out.width / scale,
      h = out.height / scale;
    const sx = ((image.naturalWidth - w) * x) / 100,
      sy = ((image.naturalHeight - h) * y) / 100;
    out.getContext('2d')?.drawImage(image, sx, sy, w, h, 0, 0, out.width, out.height);
  }, [image, aspect, zoom, x, y]);
  async function apply() {
    if (!canvas.current || !image) return;
    setBusy(true);
    try {
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.current!.toBlob(
          (b) => (b ? resolve(b) : reject(Error('Unable to prepare image'))),
          'image/webp',
          0.9,
        ),
      );
      await onDone(
        new File([blob], 'positioned-image.' + (blob.type === 'image/webp' ? 'webp' : 'png'), {
          type: blob.type,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to prepare image');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={'Position ' + label.toLowerCase()}
      wide
      onClose={() => {
        if (!busy) onCancel();
      }}
    >
      <div className="image-cropper">
        <p>Drag the image or use the controls to position it.</p>
        {error && <p role="alert">{error}</p>}
        <canvas
          ref={canvas}
          className={aspect === 1 ? 'crop-square' : 'crop-cover'}
          aria-label="Crop preview"
          style={{ aspectRatio: aspect }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, left: x, top: y };
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const rect = e.currentTarget.getBoundingClientRect();
            setX(
              Math.max(
                0,
                Math.min(
                  100,
                  drag.current.left - ((e.clientX - drag.current.x) / rect.width) * 100,
                ),
              ),
            );
            setY(
              Math.max(
                0,
                Math.min(
                  100,
                  drag.current.top - ((e.clientY - drag.current.y) / rect.height) * 100,
                ),
              ),
            );
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        />
        <label>
          Zoom
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>
        <label>
          Horizontal position
          <input
            type="range"
            min={0}
            max={100}
            value={x}
            onChange={(e) => setX(Number(e.target.value))}
          />
        </label>
        <label>
          Vertical position
          <input
            type="range"
            min={0}
            max={100}
            value={y}
            onChange={(e) => setY(Number(e.target.value))}
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="button primary"
            disabled={busy || !image}
            onClick={() => void apply()}
          >
            {busy ? 'Uploading…' : 'Use image'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
