import { useCallback, useRef, useState } from 'react';

/**
 * Elementets bredd i css-pixlar.
 *
 * Graferna ritas med viewBox lika med den uppmätta bredden, så att en
 * svg-enhet alltid är en pixel. Alternativet — fast viewBox som skalas — gör
 * texten olika stor i olika moduler, och i en smal kolumn blir elvapunkters
 * etikett sex punkter.
 *
 * Ref:en är en funktion och inte ett objekt. Med en effekt som kopplar på
 * vid montering mäts bara element som redan finns då; svarskortet monteras
 * långt senare, och figurerna i frågevyn fick bredden noll och ritades
 * aldrig. En callback-ref kopplar på när elementet dyker upp, oavsett när.
 */
export function useWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [width, setWidth] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);

  const ref = useCallback((el: T | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) return;
    observer.current = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.current.observe(el);
    setWidth(el.getBoundingClientRect().width);
  }, []);

  return [ref, width];
}
