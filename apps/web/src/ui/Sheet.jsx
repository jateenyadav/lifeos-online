import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * A modal panel. side="right" is a drawer on wide screens; on phones every sheet rises from the bottom.
 * Escape and the backdrop close it; focus moves inside and returns to the opener when it closes.
 */
export function Sheet({
  title,
  onClose,
  children,
  side = 'center',
  wide = false,
  footer,
  busy = false,
}) {
  const panel = useRef(null);
  const titleId = useId();
  const closing = useRef(onClose);
  useEffect(() => {
    closing.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const opener = document.activeElement;
    const first = panel.current?.querySelector(
      '[autofocus], input:not([type=hidden]), select, textarea, button:not(.sheet-close)',
    );
    (first ?? panel.current)?.focus?.();
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closing.current?.();
      }
      if (event.key === 'Tab' && panel.current) {
        const items = [
          ...panel.current.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
          ),
        ];
        if (!items.length) return;
        const [head, tail] = [items[0], items.at(-1)];
        if (event.shiftKey && document.activeElement === head) {
          event.preventDefault();
          tail.focus();
        } else if (!event.shiftKey && document.activeElement === tail) {
          event.preventDefault();
          head.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('sheet-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('sheet-open');
      opener?.focus?.();
    };
  }, []);
  return (
    <div
      className={`sheet-backdrop sheet-${side}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        ref={panel}
        tabIndex={-1}
        className={`sheet ${wide ? 'sheet-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="sheet-head">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="icon-button sheet-close"
            aria-label="Close"
            disabled={busy}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </section>
    </div>
  );
}

export function Switch({ checked, onChange, label, hint, disabled }) {
  return (
    <label className={`switch ${disabled ? 'is-disabled' : ''}`}>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
      <span className="switch-text">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

/** A row of toggle chips; one value or many (multiple). */
export function Chips({
  options,
  value,
  onChange,
  label,
  multiple = false,
  size = 'md',
}) {
  const selected = (option) =>
    multiple ? value.includes(option.value) : value === option.value;
  return (
    <div className={`chips chips-${size}`} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          className="chip"
          aria-pressed={selected(option)}
          data-tone={option.tone}
          onClick={() =>
            onChange(
              multiple
                ? selected(option)
                  ? value.filter((entry) => entry !== option.value)
                  : [...value, option.value]
                : option.value,
            )
          }
        >
          {option.icon && <option.icon size={14} aria-hidden="true" />}
          {option.label}
        </button>
      ))}
    </div>
  );
}
