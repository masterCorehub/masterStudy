"use strict";

class TranslatorError extends Error {
  constructor(code, message, details, cause) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "TranslatorError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function asTranslatorError(error, code, message, details) {
  if (error instanceof TranslatorError) return error;
  return new TranslatorError(code, message, details, error);
}

module.exports = {
  TranslatorError,
  asTranslatorError,
};
