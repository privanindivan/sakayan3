import { useState, useRef } from 'react'

export default function ImageCarousel({ images }) {
  const [current, setCurrent] = useState(0)
  const touchStartX = useRef(null)

  const prev = () => setCurrent(i => (i - 1 + images.length) % images.length)
  const next = () => setCurrent(i => (i + 1) % images.length)

  // Touch swipe support
  const onTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX
  }
  const onTouchEnd = (e) => {
    if (touchStartX.current === null) return
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 30) diff > 0 ? next() : prev()
    touchStartX.current = null
  }

  return (
    <div
      className="carousel"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <img src={images[current]} alt={`slide ${current + 1}`} draggable={false} />

      <button className="carousel-btn prev" onClick={prev} aria-label="Previous">&#8249;</button>
      <button className="carousel-btn next" onClick={next} aria-label="Next">&#8250;</button>

      <div className="carousel-dots">
        {images.map((_, i) => (
          <button
            key={i}
            className={`dot ${i === current ? 'active' : ''}`}
            onClick={() => setCurrent(i)}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>

      <div className="carousel-counter">{current + 1} / {images.length}</div>
    </div>
  )
}
