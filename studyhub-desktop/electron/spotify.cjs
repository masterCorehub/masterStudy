const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const AUTH = "https://accounts.spotify.com";
const API = "https://api.spotify.com/v1";
const REDIRECT_URI = "http://127.0.0.1:43821/callback";

function createSpotifyService({ app, shell, BrowserWindow }) {
  const clientId = process.env.SPOTIFY_CLIENT_ID || "";
  const tokenPath = path.join(app.getPath("userData"), "spotify-token.json");
  let token = null;
  let authServer = null;
  let authWindow = null;

  try { token = JSON.parse(fs.readFileSync(tokenPath, "utf8")); } catch {}
  const saveToken = () => fs.writeFileSync(tokenPath, JSON.stringify(token), "utf8");
  const base64url = (buffer) => buffer.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  async function refresh() {
    if (!token?.refresh_token) throw new Error("Spotify não está conectado.");
    const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: token.refresh_token });
    const response = await fetch(`${AUTH}/api/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
    });
    if (!response.ok) throw new Error("Não foi possível renovar a sessão do Spotify.");
    const next = await response.json();
    token = { ...token, ...next, expires_at: Date.now() + Number(next.expires_in || 3600) * 1000 };
    saveToken();
  }

  async function request(endpoint, options = {}, retry = true) {
    if (!token?.access_token) throw new Error("Conecte o Spotify primeiro.");
    if (token.expires_at && Date.now() > token.expires_at - 60000) await refresh();
    const response = await fetch(`${API}${endpoint}`, {
      ...options, headers: { Authorization: `Bearer ${token.access_token}`, ...(options.headers || {}) },
    });
    if (response.status === 401 && retry) { await refresh(); return request(endpoint, options, false); }
    if (!response.ok && response.status !== 204) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Spotify: ${response.status} ${detail}`);
    }
    return response.status === 204 ? null : response.json();
  }

  async function login() {
    if (!clientId) throw new Error("Defina SPOTIFY_CLIENT_ID para habilitar o Spotify.");
    const verifier = base64url(crypto.randomBytes(32));
    const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
    const state = base64url(crypto.randomBytes(16));
    const url = new URL(`${AUTH}/authorize`);
    url.search = new URLSearchParams({ client_id: clientId, response_type: "code", redirect_uri: REDIRECT_URI, scope: "user-read-playback-state user-modify-playback-state user-read-currently-playing", state, code_challenge_method: "S256", code_challenge: challenge }).toString();
    const code = await new Promise((resolve, reject) => {
      authServer = http.createServer((req, res) => {
        const incoming = new URL(req.url, REDIRECT_URI);
        if (incoming.pathname !== "/callback") return;
        if (incoming.searchParams.get("state") !== state) return reject(new Error("Estado de autenticação inválido."));
        const error = incoming.searchParams.get("error");
        res.end(error ? "Spotify não conectado. Você pode fechar esta janela." : "Spotify conectado! Você pode fechar esta janela.");
        authServer?.close(); authServer = null;
        if (error) reject(new Error("Autorização do Spotify cancelada.")); else resolve(incoming.searchParams.get("code"));
      }).listen(43821, "127.0.0.1", () => shell.openExternal(url.toString()));
      authServer.on("error", reject);
    });
    const response = await fetch(`${AUTH}/api/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI, code_verifier: verifier }) });
    if (!response.ok) throw new Error("Não foi possível concluir o login do Spotify.");
    const data = await response.json();
    token = { ...data, expires_at: Date.now() + Number(data.expires_in || 3600) * 1000 };
    saveToken();
    return { connected: true };
  }

  return {
    status: async () => ({ configured: Boolean(clientId), connected: Boolean(token?.refresh_token || token?.access_token) }),
    login,
    logout: async () => { token = null; try { fs.unlinkSync(tokenPath); } catch {} return { connected: false }; },
    search: (query) => request(`/search?${new URLSearchParams({ q: query, type: "track,playlist", limit: "8" })}`),
    playback: () => request("/me/player"),
    play: (payload = {}) => request("/me/player/play", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
    pause: () => request("/me/player/pause", { method: "PUT" }),
    next: () => request("/me/player/next", { method: "POST" }),
    previous: () => request("/me/player/previous", { method: "POST" }),
    volume: (volume) => request(`/me/player/volume?volume_percent=${Math.max(0, Math.min(100, Number(volume)))}`, { method: "PUT" }),
  };
}

module.exports = { createSpotifyService };
