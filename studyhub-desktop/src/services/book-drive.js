export async function listDriveBooks(link, { onProgress = () => {} } = {}) {
  const native = window.studyhubDesktop?.publicDrive;
  const webRequest = async params => {
    const response = await fetch(`/api/public-drive?${new URLSearchParams(params)}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "Não foi possível importar. Na versão web, publique também o serviço de download do app.");
    }
    return response;
  };
  const result = native ? await native.list(link) : await (await webRequest({ action: "list", link })).json();
  onProgress(result.files.length);
  return {
    folder: result.folder,
    files: result.files.map(file => ({
      name: file.name, displayPath: file.displayPath, relativePath: file.id,
      // The public HTML has no reliable modification metadata. Keep existing
      // files; synchronization imports new IDs rather than redownloading all.
      size: 0, lastModified: 0,
      loadSource: async () => {
        const bytes = native ? await native.download(file) : await (await webRequest({ action: "download", id: file.id, name: file.name, resourceKey: file.resourceKey || "" })).arrayBuffer();
        return new File([bytes], file.name, { type: /\.pdf$/i.test(file.name) ? "application/pdf" : "application/epub+zip" });
      },
    })),
  };
}
