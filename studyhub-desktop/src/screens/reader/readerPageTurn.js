const activeTurns = new WeakMap();

// Animate the new page as a flat sheet entering the reading viewport.
// This follows the Apple Books-like spread motion from the reference video:
// the paper stays flat and travels horizontally instead of rotating in 3D.
export function animatePageTurn(
  element,
  direction,
  {
    reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches,
  } = {},
) {
  if (!element) return;
  activeTurns.get(element)?.cancel();
  if (reducedMotion || !element.animate) return;
  const forward = direction === "next";
  const offset = forward ? "100%" : "-100%";
  element.dataset.pageTurn = direction;
  const animation = element.animate(
    [
      { transform: `translate3d(${offset}, 0, 0)`, opacity: 1 },
      { transform: "translate3d(0, 0, 0)", opacity: 1 },
    ],
    {
      duration: 380,
      easing: "cubic-bezier(.22,.61,.36,1)",
      fill: "both",
    },
  );
  activeTurns.set(element, animation);
  const cleanup = () => {
    if (activeTurns.get(element) !== animation) return;
    delete element.dataset.pageTurn;
    activeTurns.delete(element);
  };
  animation.onfinish = cleanup;
  animation.oncancel = cleanup;
  return animation;
}
