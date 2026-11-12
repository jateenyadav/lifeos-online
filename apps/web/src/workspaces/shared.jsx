import { ArrowRight, Pencil, Sparkles, Trash2, X } from 'lucide-react';

export function SpaceHeading({
  eyebrow,
  title,
  description,
  action,
  onAction,
}) {
  return (
    <div className="space-heading">
      <div>
        <span className="space-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action && (
        <button className="space-primary" onClick={onAction}>
          <span aria-hidden="true">+</span> {action}
        </button>
      )}
    </div>
  );
}
export function Stat({
  label,
  value,
  detail,
  tone = '',
  icon: Icon,
  space,
  children,
}) {
  return (
    <div className={`space-stat ${tone}`} data-space={space}>
      <span className="stat-label">
        {Icon && (
          <span className="stat-icon" aria-hidden="true">
            <Icon size={16} />
          </span>
        )}
        {label}
      </span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
      {children && <div className="stat-visual">{children}</div>}
    </div>
  );
}
export function Empty({ title, detail, action, onAction }) {
  return (
    <div className="space-empty">
      <span className="empty-orbit" aria-hidden="true">
        <Sparkles size={22} />
      </span>
      <h3>{title}</h3>
      <p>{detail}</p>
      {action && (
        <button className="space-secondary" onClick={onAction}>
          {action} <ArrowRight size={16} />
        </button>
      )}
    </div>
  );
}
export function Field({ label, children }) {
  return (
    <label className="space-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Filters({ values, active, onChange, colored = false }) {
  return (
    <div
      className={`space-filters ${colored ? 'colored' : ''}`}
      role="group"
      aria-label="Filter entries"
    >
      {values.map((value) => (
        <button
          key={value}
          data-cat={colored ? value : undefined}
          aria-pressed={active === value}
          onClick={() => onChange(value)}
        >
          {value}
        </button>
      ))}
    </div>
  );
}
export function Editor({ title, saving, onCancel, onSubmit, children, error }) {
  return (
    <section className="space-editor" aria-label={title}>
      <div className="editor-heading">
        <h2>{title}</h2>
        <button
          type="button"
          className="space-icon-button"
          aria-label="Close editor"
          disabled={saving}
          onClick={onCancel}
        >
          <X size={20} />
        </button>
      </div>
      <form onSubmit={onSubmit}>
        {children}
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        <div className="editor-actions">
          <button
            type="button"
            className="space-secondary"
            disabled={saving}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button type="submit" className="space-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </section>
  );
}
export function RecordActions({ title, saving, onEdit, onDelete, children }) {
  return (
    <div className="record-actions">
      {children}
      <button
        className="space-icon-button"
        aria-label={`Edit ${title}`}
        title="Edit"
        disabled={saving}
        onClick={onEdit}
      >
        <Pencil size={16} />
      </button>
      <button
        className="space-icon-button danger"
        aria-label={`Delete ${title}`}
        title="Delete"
        disabled={saving}
        onClick={onDelete}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
export async function deleteEntry(store, collection, entry) {
  if (window.confirm(`Delete “${entry.title}”? This cannot be undone.`))
    await store.remove(collection, entry.id);
}
