import { useEffect, type ReactNode } from 'react';

interface Props {
  title: string;
  onClose(): void;
  large?: boolean;
  children: ReactNode;
  tabs?: ReactNode;
}

export function Dialog({ title, onClose, large, children, tabs }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={`dialog${large ? ' large' : ''}`} role="dialog" aria-label={title}>
        <div className="dialog-head">
          <h2>{title}</h2>
          <button className="btn ghost small" onClick={onClose} aria-label="Sulje">
            ✕
          </button>
        </div>
        {tabs}
        <div className="dialog-body">{children}</div>
      </div>
    </div>
  );
}
