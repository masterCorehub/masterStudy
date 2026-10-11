// Apenas em memória: fechar/recarregar o aplicativo encerra o desbloqueio.
let unlockedUser = null;
let lastActivity = 0;
export function unlockJournalSession(userId, now = Date.now()) {
  unlockedUser = userId;
  lastActivity = now;
}
export function lockJournalSession() { unlockedUser = null; lastActivity = 0; }
export function touchJournalSession(now = Date.now()) { if (unlockedUser) lastActivity = now; }
export function isJournalSessionOpen(userId, minutes = 0, now = Date.now()) {
  if (!userId || unlockedUser !== userId) return false;
  if (minutes > 0 && now - lastActivity >= minutes * 60_000) {
    lockJournalSession();
    return false;
  }
  return true;
}
