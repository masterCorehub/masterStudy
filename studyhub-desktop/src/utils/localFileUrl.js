const REMOTE_OR_MEMORY_URL = /^(https?:|data:|blob:)/i;
const LOCAL_URL = /^(?:file|safe-file):\/\//i;

function decodeLocalUrl(value) {
  const source = String(value || "").trim();
  const schemeMatch = source.match(/^(file|safe-file):\/\//i);
  if (!schemeMatch) return source;
  let rawPath = source.slice(schemeMatch[0].length);
  // `local` is an artificial host used to keep Chromium's standard custom
  // protocol URL valid. It is not part of the Windows file path.
  if (schemeMatch[1].toLowerCase() === "safe-file" && /^local\//i.test(rawPath)) {
    rawPath = rawPath.slice("local".length);
  }
  try {
    rawPath = decodeURIComponent(rawPath);
  } catch {
    // Keep the original path when an old value contains a literal percent sign.
  }
  if (/^\/[A-Za-z]:[\\/]/.test(rawPath)) rawPath = rawPath.slice(1);
  if (!rawPath.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(rawPath)) {
    rawPath = `//${rawPath}`;
  }
  return rawPath;
}

export function getLocalFilePath(value) {
  const source = String(value || "").trim();
  if (!source || REMOTE_OR_MEMORY_URL.test(source)) return "";
  return LOCAL_URL.test(source) ? decodeLocalUrl(source) : source;
}

export function getLocalFileUrl(value) {
  const source = String(value || "").trim();
  if (!source || REMOTE_OR_MEMORY_URL.test(source)) {
    return source;
  }
  const localPath = decodeLocalUrl(source).replace(/\\/g, "/");
  const rootedPath = localPath.startsWith("/") ? localPath : `/${localPath}`;
  const encodedPath = rootedPath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `safe-file://local${encodedPath}`;
}
