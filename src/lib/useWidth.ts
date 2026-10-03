import { useEffect, useRef, useState } from 'react';

/**
 * Elementets bredd i css-pixlar.
 *
 * Graferna ritas med viewBox lika med den uppmätta bredden, så att en
 * svg-enhet alltid är en pixel. Alternativet — fast viewBox som skalas — gör
 * texten olika stor i olika moduler, och i en smal kolumn blir elvapunkters
 * etikett sex punkter.
 */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}
