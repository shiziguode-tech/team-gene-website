'use client';
import {useEffect} from 'react';
export default function RedesignEffects({contentKey}: {contentKey: string}) {
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    let start: (() => void) | undefined;
    void import('../public/redesign/interactions.js').then(({default: initialize}) => {
      if (cancelled) return;
      start = () => { if (!cancelled) cleanup = initialize(); };
      // A page prerendered by the speculation rules keeps its entrance
      // animations until the visitor actually opens it.
      if ((document as Document & {prerendering?: boolean}).prerendering) document.addEventListener('prerenderingchange', start, {once: true});
      else start();
    }).catch(error => console.error('Page interactions could not initialize', error));
    return () => {
      cancelled = true;
      if (start) document.removeEventListener('prerenderingchange', start);
      cleanup?.();
    };
  }, [contentKey]);
  return null;
}
