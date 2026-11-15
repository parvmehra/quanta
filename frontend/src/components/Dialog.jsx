import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import './Dialog.css';

export default function Dialog({ title, onClose, children, footer }) {
  const ref = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const first = ref.current?.querySelector('input, textarea, button.btn');
    first?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="dlg-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dlg" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="panel-head">
          <h2 className="panel-title">{title}</h2>
          <button type="button" className="shell-icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="dlg-body">{children}</div>
        {footer && <div className="dlg-foot">{footer}</div>}
      </div>
    </div>
  );
}
