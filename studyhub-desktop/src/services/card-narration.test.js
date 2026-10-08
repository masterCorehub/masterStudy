import test from "node:test";
import assert from "node:assert/strict";
import { createCardNarration } from "./card-narration.js";

function fixture(native) {
  const calls = [];
  let state;
  const synthesis = {
    speak: (u) => calls.push(["speak", u]),
    cancel: () => calls.push(["cancel"]),
    pause: () => calls.push(["pause"]),
    resume: () => calls.push(["resume"]),
    getVoices: () => [],
  };
  const audio = {
    play: async () => calls.push(["audio-play"]),
    pause: () => calls.push(["audio-pause"]),
  };
  const player = createCardNarration({
    native,
    synthesis,
    createUtterance: (text) => ({ text }),
    createAudio: () => audio,
    onChange: (s) => {
      state = s;
    },
  });
  return {
    player,
    calls,
    audio,
    get state() {
      return state;
    },
  };
}

test("browser pause/resume reuses one utterance and completion restores Ouvir", async () => {
  const f = fixture();
  await f.player.toggle("Pergunta de teste", "one:front");
  await f.player.toggle("Pergunta de teste", "one:front");
  assert.equal(f.state.status, "paused");
  await f.player.toggle("Pergunta de teste", "one:front");
  assert.equal(f.calls.filter((c) => c[0] === "speak").length, 1);
  assert.deepEqual(
    f.calls.map((c) => c[0]),
    ["speak", "pause", "resume"],
  );
  f.calls[0][1].onend();
  assert.equal(f.state.status, "idle");
});

test("switching cards cancels previous voice and ignores its end event", async () => {
  const f = fixture();
  await f.player.toggle("One", "one");
  const old = f.calls[0][1];
  await f.player.toggle("Two", "two");
  old.onend();
  assert.equal(f.state.key, "two");
  assert.ok(f.calls.some((c) => c[0] === "cancel"));
  f.player.stop();
  assert.equal(f.state.status, "idle");
});

test("native voice pauses/resumes without requesting a second narration", async () => {
  let complete;
  const calls = [];
  const f = fixture({
    speak: () => {
      calls.push("speak");
      return new Promise((r) => {
        complete = r;
      });
    },
    pauseSpeech: async () => {
      calls.push("pause");
      return { ok: true };
    },
    resumeSpeech: async () => {
      calls.push("resume");
      return { ok: true };
    },
    stopSpeech: async () => ({ ok: true }),
  });
  const pending = f.player.toggle("Pergunta", "one");
  await f.player.toggle("Pergunta", "one");
  assert.equal(f.state.status, "paused");
  await f.player.toggle("Pergunta", "one");
  assert.deepEqual(calls, ["speak", "pause", "resume"]);
  complete({ ok: true, finished: true });
  await pending;
  assert.equal(f.state.status, "idle");
  assert.equal(f.calls.length, 0);
});

test("generated audio respects pause while loading, and discards late responses after stop", async () => {
  let complete;
  const f = fixture({
    speak: () =>
      new Promise((r) => {
        complete = r;
      }),
    pauseSpeech: async () => ({ ok: true }),
    stopSpeech: async () => ({ ok: true }),
  });
  const pending = f.player.toggle("One", "one");
  await f.player.toggle("One", "one");
  complete({ ok: true, audioBase64: "fake" });
  await pending;
  assert.equal(f.calls.length, 0);
  await f.player.toggle("One", "one");
  assert.deepEqual(f.calls, [["audio-play"]]);
  f.player.stop();
  const late = f.player.toggle("Two", "two");
  f.player.stop();
  complete({ ok: true, audioBase64: "fake" });
  await late;
  assert.equal(f.state.status, "idle");
  assert.equal(f.calls.filter((c) => c[0] === "audio-play").length, 1);
});
