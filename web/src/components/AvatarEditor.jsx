import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, RotateCcw, X } from 'lucide-react';
import useModalScrollLock from '../hooks/useModalScrollLock';

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

function distance(first, second) {
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
}

function midpoint(first, second) {
  return { x: (first.clientX + second.clientX) / 2, y: (first.clientY + second.clientY) / 2 };
}

function limit(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

export default function AvatarEditor({ source, onApply, onCancel }) {
  useModalScrollLock(true);
  const cropRef = useRef(null);
  const pointersRef = useRef(new Map());
  const gestureRef = useRef(null);
  const transformRef = useRef({ zoom: 1, x: 0, y: 0 });
  const [image, setImage] = useState(null);
  const [transform, setTransform] = useState({ zoom: 1, x: 0, y: 0 });
  const [cropSize, setCropSize] = useState(320);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const selected = new Image();
    selected.onload = () => {
      setImage({ element: selected, width: selected.naturalWidth, height: selected.naturalHeight });
      transformRef.current = { zoom: 1, x: 0, y: 0 };
      setTransform(transformRef.current);
    };
    selected.onerror = () => setError('Gambar tidak dapat dibaca. Pilih gambar lain.');
    selected.src = source;
  }, [source]);

  useEffect(() => {
    if (!cropRef.current) return undefined;
    const observer = new ResizeObserver((entries) => setCropSize(entries[0]?.contentRect.width || 320));
    observer.observe(cropRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const closeWithEscape = (event) => { if (event.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', closeWithEscape);
    return () => window.removeEventListener('keydown', closeWithEscape);
  }, [onCancel]);

  function clampTransform(next) {
    if (!image || !cropRef.current) return next;
    const cropSize = cropRef.current.clientWidth;
    const zoom = limit(Number(next.zoom), MIN_ZOOM, MAX_ZOOM);
    const baseScale = Math.max(cropSize / image.width, cropSize / image.height);
    const maxX = Math.max(0, (image.width * baseScale * zoom - cropSize) / 2);
    const maxY = Math.max(0, (image.height * baseScale * zoom - cropSize) / 2);
    return { zoom, x: limit(next.x, -maxX, maxX), y: limit(next.y, -maxY, maxY) };
  }

  function commit(next) {
    const value = clampTransform(next);
    transformRef.current = value;
    setTransform(value);
  }

  function changeZoom(value) {
    commit({ ...transformRef.current, zoom: value });
  }

  function beginPointer(event) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, event);
    const points = [...pointersRef.current.values()];
    if (points.length === 1) {
      gestureRef.current = { type: 'drag', clientX: event.clientX, clientY: event.clientY, ...transformRef.current };
    } else if (points.length === 2) {
      const center = midpoint(points[0], points[1]);
      gestureRef.current = { type: 'pinch', distance: distance(points[0], points[1]), center, ...transformRef.current };
    }
  }

  function movePointer(event) {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, event);
    const points = [...pointersRef.current.values()];
    const gesture = gestureRef.current;
    if (points.length === 1 && gesture?.type === 'drag') {
      commit({ zoom: gesture.zoom, x: gesture.x + event.clientX - gesture.clientX, y: gesture.y + event.clientY - gesture.clientY });
    } else if (points.length === 2 && gesture?.type === 'pinch') {
      const center = midpoint(points[0], points[1]);
      const zoom = gesture.zoom * (distance(points[0], points[1]) / Math.max(gesture.distance, 1));
      commit({ zoom, x: gesture.x + center.x - gesture.center.x, y: gesture.y + center.y - gesture.center.y });
    }
  }

  function endPointer(event) {
    pointersRef.current.delete(event.pointerId);
    const points = [...pointersRef.current.values()];
    if (points.length === 1) {
      gestureRef.current = { type: 'drag', clientX: points[0].clientX, clientY: points[0].clientY, ...transformRef.current };
    } else {
      gestureRef.current = null;
    }
  }

  function exportAvatar(size, quality) {
    const cropSize = cropRef.current.clientWidth;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#FCF9F6';
    context.fillRect(0, 0, size, size);
    const baseScale = Math.max(cropSize / image.width, cropSize / image.height);
    const outputScale = (baseScale * transformRef.current.zoom * size) / cropSize;
    const offsetScale = size / cropSize;
    const drawX = size / 2 + transformRef.current.x * offsetScale - (image.width * outputScale) / 2;
    const drawY = size / 2 + transformRef.current.y * offsetScale - (image.height * outputScale) / 2;
    context.drawImage(image.element, drawX, drawY, image.width * outputScale, image.height * outputScale);
    return canvas.toDataURL('image/webp', quality);
  }

  async function apply() {
    if (!image) return;
    setBusy(true);
    setError('');
    try {
      const attempts = [[320, 0.82], [288, 0.72], [256, 0.65], [224, 0.58]];
      const results = attempts.map(([size, quality]) => exportAvatar(size, quality));
      const avatar = results.find((item) => item.length <= 43_000);
      if (!avatar) throw new Error('Foto masih terlalu besar. Gunakan gambar yang lebih sederhana.');
      onApply(avatar);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  const baseScale = image ? Math.max(cropSize / image.width, cropSize / image.height) : 1;

  return <div className="fixed inset-0 z-[110] flex items-center justify-center overscroll-none bg-[#FCF9F6] sm:bg-black/60 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="avatar-editor-title">
    <div className="safe-bottom safe-top flex h-[100dvh] w-full flex-col overflow-hidden bg-white px-4 pb-4 pt-3 sm:h-auto sm:max-h-[95dvh] sm:max-w-lg sm:rounded-3xl sm:p-6 sm:shadow-2xl">
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-stone-200 pb-3 sm:border-0 sm:pb-0"><div><h2 id="avatar-editor-title" className="section-title">Sesuaikan Foto Profil</h2><p className="mt-1 text-xs leading-5 text-stone-600">Geser foto atau cubit dua jari. Mouse dapat memakai drag dan roda scroll.</p></div><button type="button" className="btn-ghost shrink-0 p-2" onClick={onCancel} aria-label="Tutup editor"><X size={20} /></button></div>
      <div className="flex min-h-0 flex-1 items-center justify-center py-3 sm:py-5"><div ref={cropRef} className="relative aspect-square w-[min(82vw,42dvh,320px)] shrink-0 touch-none overflow-hidden rounded-2xl bg-stone-200 select-none sm:w-full sm:max-w-80" onPointerDown={beginPointer} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={endPointer} onWheel={(event) => { event.preventDefault(); changeZoom(transformRef.current.zoom - event.deltaY * 0.0015); }}>
        {image && <img src={source} alt="Pratinjau foto profil" draggable="false" className="pointer-events-none absolute left-1/2 top-1/2 max-w-none" style={{ width: image.width, height: image.height, transform: `translate(-50%, -50%) translate(${transform.x}px, ${transform.y}px) scale(${baseScale * transform.zoom})` }} />}
        <div className="pointer-events-none absolute inset-3 rounded-full ring-2 ring-white shadow-[0_0_0_999px_rgba(0,0,0,.42)]" />
      </div></div>
      <div className="shrink-0"><div className="flex items-center gap-3"><button type="button" className="btn-ghost p-2" onClick={() => changeZoom(transform.zoom - 0.15)} aria-label="Perkecil"><Minus size={19} /></button><input className="h-2 w-full accent-[#E86B32]" type="range" min={MIN_ZOOM} max={MAX_ZOOM} step="0.01" value={transform.zoom} onChange={(event) => changeZoom(Number(event.target.value))} aria-label="Zoom foto" /><button type="button" className="btn-ghost p-2" onClick={() => changeZoom(transform.zoom + 0.15)} aria-label="Perbesar"><Plus size={19} /></button></div>
      <button type="button" className="btn-ghost mt-1 w-full" onClick={() => commit({ zoom: 1, x: 0, y: 0 })}><RotateCcw size={16} />Atur ulang posisi</button>
      {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:mt-5"><button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>Batal</button><button type="button" className="btn-primary" onClick={apply} disabled={!image || busy}>{busy ? 'Memproses...' : 'Gunakan Foto'}</button></div></div>
    </div>
  </div>;
}
