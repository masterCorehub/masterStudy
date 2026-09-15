export const isMacPlatform = () => {
  if (typeof navigator === "undefined") return false;
  const platform = navigator.userAgentData?.platform || navigator.platform || "";
  return /mac|iphone|ipad|ipod/i.test(platform);
};

export const isPrimaryShortcut = (event) =>
  isMacPlatform() ? event.metaKey : event.ctrlKey;

export const shortcutLabel = (shortcut) => {
  const mac = isMacPlatform();
  return String(shortcut)
    .replaceAll("Mod", mac ? "⌘" : "Ctrl")
    .replaceAll("Alt", mac ? "⌥" : "Alt")
    .replaceAll("Shift", mac ? "⇧" : "Shift")
    .split("+")
    .join(mac ? "" : " + ");
};
