import { useEffect, useState } from 'preact/hooks';

// Keeps an overlay mounted long enough to play its exit animation when
// `isOpen` flips false. Returns `visible` (render while true) and `closing`
// (apply your .closing class while true). This lets shell overlays fade out in
// step with the app's viewport fade instead of cutting to a blank frame.
export function useExitFade(isOpen: boolean, durationMs = 150): { visible: boolean; closing: boolean } {
  const [visible, setVisible] = useState(isOpen);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setClosing(false);
      setVisible(true);
      return;
    }
    if (visible) {
      setClosing(true);
      const t = setTimeout(() => setVisible(false), durationMs);
      return () => clearTimeout(t);
    }
  }, [isOpen, visible, durationMs]);

  return { visible, closing };
}
