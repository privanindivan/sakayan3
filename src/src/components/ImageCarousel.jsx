import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

function Lightbox({ images, startIndex, onClose }) {
  const [current, setCurrent] = useState(startIndex)
  const touchStartX = useRef(null)

  const prev = () => setCurrent(i => (i - 1 + images.length) % images.length)
  const next = () => setCurrent(i => (i + 1) % images.length)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape')     onClose()
      if (e.key === 'ArrowLeft')  prev()
      if (e.key === 'ArrowRight') next()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX }
  const onTouchEnd   = (e) => {
    if (touchStartX.current === null) return
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 30) diff > 0 ? next() : prev()
    touchStartX.current = null
  }

  return createPortal(
    <div className="lightbox-overlay" onClick={onClose}>
      <div
        className="lightbox"
        onClick={e => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <button className="lightbox-close" onClick={onClose} aria-label="Close">&#x2715;</button>

        <img
          className="lightbox-img"
          src={images[current]}
          alt={`photo ${current + 1}`}
          draggable={false}
        />

        {images.length > 1 && (
          <>
            <button className="lightbox-btn prev" onClick={prev} aria-label="Previous">&#8249;</button>
            <button className="lightbox-btn next" onClick={next} aria-label="Next">&#8250;</button>
          </>
        )}

        <div className="lightbox-counter">{current + 1} / {images.length}</div>

        {images.length > 1 && (
          <div className="lightbox-dots">
            {images.map((_, i) => (
              <button
                key={i}
                className={`dot ${i === current ? 'active' : ''}`}
                onClick={() => setCurrent(i)}
                aria-label={`Photo ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

export default function ImageCarousel({ images }) {
  const [current,  setCurrent]  = useState(0)
  const [lightbox, setLightbox] = useState(false)
  const touchStartX = useRef(null)

  const safeImages = images ?? []
  const hasImages  = safeImages.length > 0

  const prev = () => setCurrent(i => (i - 1 + safeImages.length) % safeImages.length)
  const next = () => setCurrent(i => (i + 1) % safeImages.length)

  const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX }
  const onTouchEnd   = (e) => {
    if (touchStartX.current === null) return
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 30) diff > 0 ? next() : prev()
    touchStartX.current = null
  }

  if (!hasImages) {
    return (
      <div className="carousel carousel-empty">
        <span className="carousel-no-photo">📷 No photos yet</span>
      </div>
    )
  }

  return (
    <>
      <div
        className="carousel"
        onClick={() => setLightbox(true)}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{ cursor: 'zoom-in' }}
      >
        <img
          src={safeImages[current]}
          alt={`slide ${current + 1}`}
          draggable={false}
        />

        <button className="carousel-btn prev" onClick={e => { e.stopPropagation(); prev() }} aria-label="Previous">&#8249;</button>
        <button className="carousel-btn next" onClick={e => { e.stopPropagation(); next() }} aria-label="Next">&#8250;</button>

        <div className="carousel-dots" onClick={e => e.stopPropagation()}>
          {safeImages.map((_, i) => (
            <button
              key={i}
              className={`dot ${i === current ? 'active' : ''}`}
              onClick={() => setCurrent(i)}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>

        <div className="carousel-counter">{current + 1} / {safeImages.length}</div>
      </div>

      {lightbox && (
        <Lightbox
          images={safeImages}
          startIndex={current}
          onClose={() => setLightbox(false)}
        />
      )}
    </>
  )
}
