import { InstallApp } from './PWA';
import { MessageBadge } from './message-state';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState, useId, type CSSProperties } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { MoreHorizontal, Compass, Settings, Info } from 'lucide-react';
import { AppearanceControls } from './Appearance';
export function MoreMenu({ menus }: { menus: { key: string; label: string; path: string }[] }) {
  const popup = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties>({});
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => setOpen(false), [location.pathname, location.search]);
  useEffect(() => {
    if (!open) return;
    const click = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node) && !popup.current?.contains(e.target as Node))
        setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', click);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', click);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <div className="more-menu" ref={ref}>
      <button
        ref={button}
        className="more-trigger"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          const r = button.current!.getBoundingClientRect();
          setPosition({
            position: 'fixed',
            left: Math.max(12, Math.min(r.left, innerWidth - 312)),
            bottom: innerWidth <= 700 ? 78 : Math.max(12, innerHeight - r.bottom),
            maxHeight: innerWidth <= 700 ? '70dvh' : Math.max(120, r.bottom - 12),
          });
          setOpen(!open);
        }}
      >
        <MoreHorizontal size={23} />
        <span>More</span>
        {menus.some((m) => m.path === '/messages') && <MessageBadge />}
      </button>
      {open &&
        createPortal(
          <div
            ref={popup}
            style={position}
            className="more-popover"
            id={menuId}
            aria-label="More navigation"
          >
            <div className="more-links">
              {menus
                .filter((m) => m.path !== '/settings')
                .map((menu) => (
                  <NavLink key={menu.key} to={menu.path}>
                    <Compass size={20} />
                    {menu.label}
                    {menu.path === '/messages' && <MessageBadge />}
                  </NavLink>
                ))}
              <NavLink to="/settings">
                <Settings size={20} />
                Settings
              </NavLink>
              <NavLink to="/about">
                <Info size={20} />
                About FpiUpdates
              </NavLink>
            </div>
            <InstallApp />
            <AppearanceControls />
          </div>,
          document.body,
        )}
    </div>
  );
}
