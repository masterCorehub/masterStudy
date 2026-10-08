const activeNotifications = new Set();

function deliverNotification(notification, timeoutMs = 15000) {
  // A referência mantém a notificação viva; chamar show() não confirma entrega.
  activeNotifications.add(notification);
  return new Promise(resolve => {
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (!result.shown) activeNotifications.delete(notification);
      resolve(result);
    };
    const timeout = setTimeout(() => finish({ shown: false, reason: 'timeout', error: 'O sistema não confirmou a entrega. Confira as permissões de notificações.' }), timeoutMs);
    notification.once('show', () => finish({ shown: true }));
    notification.once('failed', (_event, error) => finish({ shown: false, reason: 'failed', error: String(error || 'O sistema recusou a notificação.') }));
    notification.once('close', () => activeNotifications.delete(notification));
    notification.once('click', () => activeNotifications.delete(notification));
    try { notification.show(); } catch (error) { finish({ shown: false, reason: 'failed', error: error.message }); }
  });
}
module.exports = { deliverNotification };
