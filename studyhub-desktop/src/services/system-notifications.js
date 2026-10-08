export async function showSystemNotification(payload, { requestPermission = false } = {}) {
  if (window.studyhubDesktop?.notifications?.show) return window.studyhubDesktop.notifications.show(payload);
  if (!('Notification' in window)) return { shown: false, reason: 'unsupported', error: 'Este navegador não oferece notificações.' };
  let permission = window.Notification.permission;
  // O pedido de permissão acontece apenas após o clique no teste das configurações.
  if (permission === 'default' && requestPermission) permission = await window.Notification.requestPermission();
  if (permission !== 'granted') return { shown: false, reason: 'permission', error: 'Permita notificações para este site nas configurações do navegador.' };
  return new Promise(resolve => {
    const notification = new window.Notification(payload.title, { body: payload.body, silent: payload.sound === false });
    const timeout = setTimeout(() => resolve({ shown: false, reason: 'timeout' }), 10000);
    notification.onshow = () => { clearTimeout(timeout); resolve({ shown: true }); };
    notification.onerror = () => { clearTimeout(timeout); resolve({ shown: false, reason: 'failed' }); };
    notification.onclick = () => { window.focus(); window.dispatchEvent(new CustomEvent('studyhub:navigate', { detail: { screen: payload.screen } })); notification.close(); };
  });
}
