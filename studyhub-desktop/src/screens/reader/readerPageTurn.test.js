import { test } from "node:test";
import assert from "node:assert/strict";
import { animatePageTurn } from "./readerPageTurn.js";

test("page turns keep direction, replace active effects and clean up", () => {
  const calls = [];
  const element = {
    dataset: {},
    animate(frames, options) {
      const animation = {
        cancel() {
          this.cancelled = true;
          this.oncancel?.();
        },
      };
      calls.push({ frames, options, animation });
      return animation;
    },
  };
  animatePageTurn(element, "next", { reducedMotion: false });
  assert.equal(calls[0].frames[0].transform, "translate3d(100%, 0, 0)");
  assert.equal(calls[0].options.duration, 380);
  assert.equal(calls[0].options.fill, "both");
  assert.equal(element.dataset.pageTurn, "next");
  animatePageTurn(element, "prev", { reducedMotion: false });
  assert.equal(calls[0].animation.cancelled, true);
  assert.equal(calls[1].frames[0].transform, "translate3d(-100%, 0, 0)");
  calls[1].animation.onfinish();
  assert.equal(element.dataset.pageTurn, undefined);
  animatePageTurn(element, "next", { reducedMotion: true });
  assert.equal(calls.length, 2);
});
