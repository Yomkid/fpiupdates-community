import { useEffect, useRef, useState, type RefObject } from 'react';
import { Smile, X } from 'lucide-react';
/** Keep selection before focus moves to the picker; insertion stays ordinary Unicode text. */
export function EmojiButton({
  inputRef,
  value,
  onChange,
  disabled = false,
}: {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const range = useRef({ start: 0, end: 0 });
  const current = useRef({ value, onChange });
  current.current = { value, onChange };
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setError(false);
    setReady(false);
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        inputRef.current?.focus();
      }
    };
    const outside = (e: PointerEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', close, true);
    document.addEventListener('pointerdown', outside);
    Promise.all([import('emoji-mart'), import('@emoji-mart/data/sets/15/twitter.json')])
      .then(([{ Picker }, data]) => {
        if (!active || !host.current) return;
        const picker = new Picker({
          data: data.default,
          set: 'twitter',
          getSpritesheetURL: () => '/emoji/picker-twitter.webp',
          theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
          autoFocus: true,
          emojiVersion: 15,
          noCountryFlags: false,
          perLine: 8,
          maxFrequentRows: 2,
          previewPosition: 'none',
          skinTonePosition: 'search',
          onEmojiSelect: (emoji: { native: string }) => {
            const { value, onChange } = current.current;
            const start = Math.min(range.current.start, value.length),
              end = Math.min(range.current.end, value.length);
            onChange(value.slice(0, start) + emoji.native + value.slice(end));
            const caret = start + emoji.native.length;
            setOpen(false);
            requestAnimationFrame(() => {
              inputRef.current?.focus();
              inputRef.current?.setSelectionRange(caret, caret);
              inputRef.current?.dispatchEvent(new Event('select', { bubbles: true }));
            });
          },
        });
        host.current.replaceChildren(picker as unknown as Node);
        setReady(true);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
      document.removeEventListener('keydown', close, true);
      document.removeEventListener('pointerdown', outside);
      host.current?.replaceChildren();
    };
  }, [open]);
  return (
    <span className="emoji-control">
      <button
        className="icon-button"
        type="button"
        aria-label="Add emoji"
        title="Add emoji"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          const input = inputRef.current;
          range.current = {
            start: input?.selectionStart ?? value.length,
            end: input?.selectionEnd ?? value.length,
          };
          setOpen(!open);
        }}
      >
        <Smile size={20} />
      </button>
      {open && (
        <div className="emoji-popover" ref={panel} role="dialog" aria-label="Choose an emoji">
          <div className="emoji-heading">
            <strong>Emojis</strong>
            <button
              type="button"
              className="icon-button"
              aria-label="Close emoji picker"
              onClick={() => {
                setOpen(false);
                inputRef.current?.focus();
              }}
            >
              <X size={18} />
            </button>
          </div>
          {error ? (
            <p role="alert">Couldn’t load emojis. Close and try again.</p>
          ) : (
            <>
              {!ready && <p role="status">Loading emojis…</p>}
              <div ref={host} className="emoji-picker-host" />
            </>
          )}
        </div>
      )}
    </span>
  );
}
