import { useFeatures } from './Features';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { api, errorMessage, type User } from './api';
import { ErrorBox } from './components';
import { useSession } from './session';
import { useInteractions } from './interactions';
import { toast } from './toast';
export function MessageProfileButton({ account }: { account: User }) {
  const { flags } = useFeatures();
  const { user } = useSession();
  const navigate = useNavigate();
  const ui = useInteractions();
  if (!flags.messages || user?.id === account.id || account.blocked) return null;
  const open = () => navigate('/messages?to=' + encodeURIComponent(account.username));
  return (
    <button
      className="icon-button profile-message-button"
      aria-label={'Message @' + account.username}
      title="Send a private message"
      onClick={() => (user ? open() : ui.auth('login', open))}
    >
      <Mail size={20} />
    </button>
  );
}
export function MessagePrivacy() {
  const { flags } = useFeatures();
  const { user } = useSession();
  const [policy, setPolicy] = useState('REQUESTS');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (user && flags.messages)
      api<{ policy: string }>('/messages/settings')
        .then((p) => setPolicy(p.policy))
        .catch(() => {});
  }, [user?.id, flags.messages]);
  if (!user || !flags.messages) return null;
  return (
    <section id="messages" className="message-privacy">
      <h2>Message privacy</h2>
      <p>Who can start a new conversation with you?</p>
      <select
        aria-label="Who can message you"
        value={policy}
        disabled={busy}
        onChange={async (e) => {
          const next = e.target.value;
          setBusy(true);
          try {
            await api('/messages/settings', {
              method: 'PUT',
              body: JSON.stringify({ policy: next }),
            });
            setPolicy(next);
            toast('Message privacy updated.', 'success');
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <option value="REQUESTS">Anyone can send a message request</option>
        <option value="FOLLOWING">Only people I follow</option>
        <option value="NOBODY">No new conversations</option>
      </select>
      <small>
        Existing accepted conversations remain available. Blocking an account prevents messages.
        Messages are not end-to-end encrypted; reported messages can be reviewed by authorised
        moderators.
      </small>
      {error && <ErrorBox message={error} />}
    </section>
  );
}
