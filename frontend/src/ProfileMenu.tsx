import { useEffect, useId, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { type User } from './api';
import { SafetyControls } from './Safety';
import { useSession } from './session';
import { useInteractions } from './interactions';
export function ProfileMenu({ account, onChange }: { account: User; onChange: () => void }) {
  const { user } = useSession();
  const ui = useInteractions();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target as HTMLElement).closest('dialog')) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        ref.current?.querySelector<HTMLButtonElement>(':scope > button')?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape, true);
    };
  }, [open]);
  if (user?.id === account.id) return null;
  return (
    <div className="profile-more" ref={ref}>
      <button
        className="icon-button profile-more-trigger"
        aria-label={'More options for @' + account.username}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal size={20} />
      </button>
      {open && (
        <div
          className="dropdown profile-more-popover"
          id={id}
          role="group"
          aria-label="Profile options"
        >
          {user ? (
            <SafetyControls
              account={account}
              onChange={() => {
                setOpen(false);
                onChange();
              }}
            />
          ) : (
            <button onClick={() => ui.auth()}>Sign in to manage this account</button>
          )}
        </div>
      )}
    </div>
  );
}
