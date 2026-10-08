import drive from "../electron/public-drive.cjs";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Método não permitido." });
  try {
    if (req.query.action === "list") return res.json(await drive.listPublicDrive(req.query.link));
    if (req.query.action !== "download") return res.status(400).json({ error: "Ação inválida." });
    // Desktop downloads do not have Vercel's response size ceiling.
    const bytes = await drive.downloadPublicDrive({ id: req.query.id, name: req.query.name, resourceKey: req.query.resourceKey }, { maxBytes: 4 * 1024 * 1024 });
    res.setHeader("Content-Type", /\.pdf$/i.test(req.query.name) ? "application/pdf" : "application/epub+zip");
    return res.send(bytes);
  } catch (error) {
    return res.status(400).json({ error: error.message || "Não foi possível importar do Drive." });
  }
}
