import { useEffect, useState } from 'react';
import { api, errorMessage } from './api';
import { toast } from './toast';
import { useSession } from './session';
import { pushOwner, savePushOwner } from './push-owner';
export function PushSettings() {
  const { user } = useSession();
  const [configured, setConfigured] = useState(false),
    [enabled, setEnabled] = useState(false),
    [busy, setBusy] = useState(false);
  const supported =
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;
  useEffect(() => {
    let live = true;
    api<{ enabled: boolean }>('/push/config')
      .then((c) => {
        if (live) setConfigured(c.enabled);
      })
      .catch(() => {});
    if (supported)
      navigator.serviceWorker
        .getRegistration('/')
        .then((r) => r?.pushManager.getSubscription())
        .then((s) => {
          if (live) setEnabled(!!s && pushOwner() === user?.id);
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [user?.id]);
  async function change() {
    const permissionRequest = !enabled ? Notification.requestPermission() : null;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const old = await reg.pushManager.getSubscription();
      if (enabled && old) {
        await api('/push/subscription', {
          method: 'DELETE',
          body: JSON.stringify({ endpoint: old.endpoint }),
        });
        await old.unsubscribe();
        savePushOwner(null);
        setEnabled(false);
        toast('Background notifications disabled on this device.', 'success');
        return;
      }
      const c = await api<{ enabled: boolean; publicKey: string }>('/push/config');
      if (!c.enabled) throw Error('Background notifications are not configured yet.');
      const permission = await permissionRequest;
      if (permission !== 'granted')
        throw Error('Allow notifications in your browser or device settings to continue.');
      const raw = atob(c.publicKey.replace(/-/g, '+').replace(/_/g, '/'));
      const key = Uint8Array.from(raw, (x) => x.charCodeAt(0));
      const sub =
        old ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
      const json = sub.toJSON();
      try {
        await api('/push/subscription', {
          method: 'PUT',
          body: JSON.stringify({
            endpoint: sub.endpoint,
            p256dh: json.keys?.p256dh,
            auth: json.keys?.auth,
          }),
        });
      } catch (e) {
        if (!old) await sub.unsubscribe();
        throw e;
      }
      savePushOwner(user?.id ?? null);
      setEnabled(true);
      toast('Background notifications enabled on this device.', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }
  async function test() {
    setBusy(true);
    try {
      const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      if (!sub) throw Error('Enable background notifications first.');
      await api('/push/test', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) });
      toast('Test sent through the push service.', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-card">
      <h2>Background notifications</h2>
      <p>Receive a private activity summary on this device, even when FpiUpdates is closed.</p>
      {!supported ? (
        <p className="form-note">
          On iPhone or iPad, install FpiUpdates on your Home Screen and open it there. A supported
          device and browser are required.
        </p>
      ) : !configured ? (
        <p className="form-note">
          Background delivery is awaiting server configuration. In-app notifications still work.
        </p>
      ) : (
        <div className="push-actions">
          <button className="button secondary" disabled={busy} onClick={() => void change()}>
            {busy ? 'Please wait…' : enabled ? 'Disable on this device' : 'Enable on this device'}
          </button>
          {enabled && (
            <button className="text-button" disabled={busy} onClick={() => void test()}>
              Send background test
            </button>
          )}
        </div>
      )}
      <p className="form-note">
        Signing out stops delivery. Sign in and enable again to reconnect. Private-message
        background push is not included yet.
      </p>
    </section>
  );
}
