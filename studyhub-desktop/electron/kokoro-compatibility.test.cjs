const test = require("node:test");
const assert = require("node:assert/strict");

test("Kokoro loads with the audited Transformers runtime", async () => {
  const [{ KokoroTTS }, transformers] = await Promise.all([
    import("kokoro-js"),
    import("@huggingface/transformers"),
  ]);

  assert.equal(typeof KokoroTTS?.from_pretrained, "function");
  for (const exportedName of [
    "StyleTextToSpeech2Model",
    "AutoTokenizer",
    "Tensor",
    "RawAudio",
    "env",
  ]) {
    assert.ok(transformers[exportedName], `${exportedName} must remain available`);
  }
});
