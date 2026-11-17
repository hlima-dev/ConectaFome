import { useEffect, useRef, useState } from 'react'

// Número que "sobe" até o valor novo em vez de aparecer de uma vez. Respeita quem
// prefere menos movimento (e ambientes sem animação, como os testes): nesses casos
// mostra o valor direto.
export function useCountUp(target: number, durationMs = 700): number {
  const reduced = typeof window === 'undefined' || typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [value, setValue] = useState(target)
  const from = useRef(target)

  useEffect(() => {
    if (reduced) return
    const start = performance.now()
    const origin = from.current
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      const current = origin + (target - origin) * eased
      from.current = current
      setValue(current)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, durationMs, reduced])

  return reduced ? target : value
}
