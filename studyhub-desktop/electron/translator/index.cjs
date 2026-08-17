"use strict";

const { TranslatorError } = require("./errors.cjs");
const { createGoogleTranslator } = require("./translate.cjs");
const { createOcrService } = require("./ocr.cjs");

function createTranslatorService({
  fetchImpl,
  dataDir,
  getDataDir,
  onProgress,
  translationOptions = {},
  ocrOptions = {},
  ...advancedOcrOptions
} = {}) {
  const translator = createGoogleTranslator({
    ...translationOptions,
    fetchImpl: fetchImpl || translationOptions.fetchImpl,
  });
  const ocr = createOcrService({
    ...advancedOcrOptions,
    ...ocrOptions,
    dataDir: dataDir ?? ocrOptions.dataDir,
    getDataDir: getDataDir ?? ocrOptions.getDataDir,
    onProgress: onProgress ?? ocrOptions.onProgress,
  });

  return {
    translate: (payload) => translator.translate(payload),
    recognize: (imageBuffer, options) => ocr.recognize(imageBuffer, options),
    terminate: () => ocr.terminate(),
  };
}

module.exports = {
  TranslatorError,
  createTranslatorService,
  ...require("./translate.cjs"),
  ...require("./ocr.cjs"),
};
