export const isBrowserFilePickerAvailable = () =>
  typeof window !== "undefined" && typeof document !== "undefined";

export function readBrowserFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve({
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
      dataUrl: String(reader.result || ""),
      addedAt: Date.now(),
    });
    reader.onerror = () => reject(reader.error || new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}
