import { useEffect } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

export default function Lightbox({ images, index, onClose, onNavigate }) {
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && index > 0) onNavigate(index - 1);
      else if (e.key === 'ArrowRight' && index < images.length - 1) onNavigate(index + 1);
    };
    document.addEventListener('keydown', handleKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prev;
    };
  }, [index, images.length, onClose, onNavigate]);

  const current = images[index];
  if (!current) return null;

  const hasPrev = index > 0;
  const hasNext = index < images.length - 1;

  const navBtn = {
    position: 'absolute',
    top: '50%', transform: 'translateY(-50%)',
    width: '44px', height: '44px',
    background: 'rgba(255,255,255,0.10)',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: '50%', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'white', zIndex: 1,
    transition: 'background 0.15s',
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image lightbox"
      style={{
        position: 'fixed', inset: 0, zIndex: 3000,
        background: 'rgba(28,26,22,0.93)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '64px 70px 48px',
      }}
      onClick={onClose}
    >
      {/* Close */}
      <button
        aria-label="Close image"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        style={{
          ...navBtn,
          position: 'absolute', top: '16px', right: '16px',
          transform: 'none',
        }}
      >
        <X size={18} />
      </button>

      {/* Prev */}
      {hasPrev && (
        <button
          aria-label="Previous image"
          onClick={(e) => { e.stopPropagation(); onNavigate(index - 1); }}
          style={{ ...navBtn, left: '16px' }}
        >
          <ChevronLeft size={22} />
        </button>
      )}

      {/* Image */}
      <img
        src={current.src}
        alt={current.alt}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '100%',
          maxHeight: '85vh',
          objectFit: 'contain',
          borderRadius: '4px',
          display: 'block',
          userSelect: 'none',
        }}
      />

      {/* Next */}
      {hasNext && (
        <button
          aria-label="Next image"
          onClick={(e) => { e.stopPropagation(); onNavigate(index + 1); }}
          style={{ ...navBtn, right: '16px' }}
        >
          <ChevronRight size={22} />
        </button>
      )}

      {/* Counter */}
      {images.length > 1 && (
        <p style={{
          position: 'absolute', bottom: '16px',
          left: '50%', transform: 'translateX(-50%)',
          color: 'rgba(255,255,255,0.45)', fontSize: '13px',
          fontWeight: '500', margin: 0, userSelect: 'none',
          letterSpacing: '0.5px',
        }}>
          {index + 1} / {images.length}
        </p>
      )}
    </div>
  );
}
