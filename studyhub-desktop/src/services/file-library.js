const APP_LIBRARY_ROOT = "%APPDATA%\\StudyHub\\library";

export function getPlannedLibraryRoot() {
  return APP_LIBRARY_ROOT;
}

export function listLibraryAssets() {
  return [];
}

export function planImportAsset({ moduleId, fileName }) {
  return {
    status: "planned",
    moduleId,
    fileName,
    libraryPath: `${APP_LIBRARY_ROOT}\\${moduleId}\\${fileName}`,
  };
}
