import { api } from './api';
import { measurementExcluded } from './analytics-tracker';
import { Link } from 'react-router-dom';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { toast } from './toast';
function observe(event: 'installed' | 'launch') {
  if (measurementExcluded()) return;
  try {
    let id = localStorage.getItem('fpiupdates.install.id');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('fpiupdates.install.id', id);
    }
    if (event === 'launch') {
      const day = new Date().toISOString().slice(0, 10);
      if (localStorage.getItem('fpiupdates.install.day') === day) return;
      localStorage.setItem('fpiupdates.install.day', day);
    }
    const platform =
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
        ? 'ios'
        : /Android/.test(navigator.userAgent)
          ? 'android'
          : 'desktop';
    void api('/installation/observe', {
      method: 'POST',
      body: JSON.stringify({ id, event, platform }),
    }).catch(() => {});
  } catch {}
}
type Prompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const Context = createContext<{
  installed: boolean;
  prompt: Prompt | null;
  waiting: ServiceWorker | null;
  clearPrompt: () => void;
}>({ installed: false, prompt: null, waiting: null, clearPrompt: () => {} });
export function PWAProvider({ children }: { children: ReactNode }) {
  const [installed, setInstalled] = useState(false),
    [prompt, setPrompt] = useState<Prompt | null>(null),
    [waiting, setWaiting] = useState<ServiceWorker | null>(null),
    [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    let alive = true;
    const display = window.matchMedia('(display-mode: standalone)');
    const check = () => {
      const value =
        display.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      setInstalled(value);
      if (value) observe('launch');
    };
    check();
    display.addEventListener('change', check);
    const before = (e: Event) => {
      e.preventDefault();
      setPrompt(e as Prompt);
    };
    const added = () => {
      observe('installed');
      setInstalled(true);
      setPrompt(null);
    };
    const connection = () => setOnline(navigator.onLine);
    window.addEventListener('beforeinstallprompt', before);
    window.addEventListener('appinstalled', added);
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    if ('serviceWorker' in navigator && window.isSecureContext)
      navigator.serviceWorker
        .register('/notification-worker.js', { scope: '/' })
        .then((reg) => {
          if (!alive) return;
          if (reg.waiting) setWaiting(reg.waiting);
          reg.addEventListener('updatefound', () => {
            const worker = reg.installing;
            worker?.addEventListener('statechange', () => {
              if (alive && worker.state === 'installed' && navigator.serviceWorker.controller)
                setWaiting(worker);
            });
          });
        })
        .catch(() => {});
    return () => {
      alive = false;
      display.removeEventListener('change', check);
      window.removeEventListener('beforeinstallprompt', before);
      window.removeEventListener('appinstalled', added);
      window.removeEventListener('online', connection);
      window.removeEventListener('offline', connection);
    };
  }, []);
  return (
    <Context.Provider value={{ installed, prompt, waiting, clearPrompt: () => setPrompt(null) }}>
      {!online && (
        <div className="connection-banner" role="status">
          You’re offline. Reconnect to load posts and send updates.
        </div>
      )}
      {children}
    </Context.Provider>
  );
}
export function InstallApp({ details = false }: { details?: boolean }) {
  const { installed, prompt, waiting, clearPrompt } = useContext(Context);
  const [busy, setBusy] = useState(false);
  const ios =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  async function install() {
    if (!window.isSecureContext) {
      toast('Installation needs HTTPS, or localhost for development.', 'info');
      return;
    }
    if (!prompt) {
      toast(
        ios
          ? 'In Safari, tap Share, then Add to Home Screen.'
          : 'Open your browser menu and choose Install app or Add to Home screen.',
        'info',
      );
      return;
    }
    setBusy(true);
    clearPrompt();
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') toast('Installation requested.', 'success');
    } catch {
      toast('Use the browser menu to install FpiUpdates.', 'info');
    } finally {
      setBusy(false);
    }
  }
  function update() {
    if (!waiting) return;
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), {
      once: true,
    });
    waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
  }
  return (
    <section className={details ? 'settings-card pwa-settings' : 'pwa-menu'}>
      {details && (
        <>
          <h2>FpiUpdates app</h2>
          <p>
            Install FpiUpdates on your home screen. Installation does not require an app store. You
            still need a connection to read and send posts.
          </p>
        </>
      )}
      {installed ? (
        <span className="muted">FpiUpdates is installed</span>
      ) : (
        <button
          className={details ? 'button secondary' : 'pwa-install'}
          disabled={busy}
          onClick={() => void install()}
        >
          <Download size={19} />
          {busy ? 'Opening installer…' : 'Install FpiUpdates'}
        </button>
      )}
      {waiting && (
        <>
          <p className="form-note">An update is ready. Finish any unsent draft before reloading.</p>
          <button className="text-button" onClick={update}>
            <RefreshCw size={16} />
            Reload to update
          </button>
        </>
      )}
      {details && (
        <p className="form-note">
          iPhone/iPad: open in Safari → Share → Add to Home Screen. Browser and device support
          determine which installation controls appear. For background alerts, sign in and open
          Settings → Notifications.
        </p>
      )}
    </section>
  );
}

export function InstallPromotion() {
  const { installed } = useContext(Context);
  const [hidden, setHidden] = useState(() => {
    try {
      return Number(localStorage.getItem('fpiupdates.install.dismiss')) > Date.now();
    } catch {
      return false;
    }
  });
  if (installed || hidden) return null;
  return (
    <section className="install-promotion">
      <div>
        <strong>Keep your community close</strong>
        <p>Add FpiUpdates to your home screen for quicker access.</p>
        <InstallApp />
        <Link to="/install">Installation help →</Link>
      </div>
      <button
        className="icon-button"
        aria-label="Dismiss installation reminder for 30 days"
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem('fpiupdates.install.dismiss', String(Date.now() + 30 * 86400000));
          } catch {}
        }}
      >
        ×
      </button>
    </section>
  );
}
