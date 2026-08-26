"use client";

import { ReactNode, useEffect, useId, useRef, useState } from "react";
import { Icon } from "./icons";
import { Period } from "./types";

export function PageHeading({
  eyebrow,
  title,
  body,
  action,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {body ? <p className="lede">{body}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Segmented({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? "active" : ""}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function PeriodPicker({ value, onChange }: { value: Period; onChange: (period: Period) => void }) {
  return (
    <Segmented
      label="Time period"
      value={String(value)}
      options={[
        { value: "14", label: "2W" },
        { value: "30", label: "1M" },
        { value: "90", label: "3M" },
      ]}
      onChange={(next) => onChange(Number(next) as Period)}
    />
  );
}

export function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="stat">
      <small>{label}</small>
      <strong>{value}</strong>
      <span>{detail}</span>
    </div>
  );
}

export function RecordPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="record-pill">
      <small>{label}</small>
      <b>{value}</b>
    </div>
  );
}

export function Empty({ icon, title, body, action }: { icon: string; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <span>
        <Icon name={icon} />
      </span>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

/**
 * A title, the one line that answers it, and a chevron.
 *
 * The same device everywhere something has more to say than it should say at
 * once: whether the week is covered, what a session holds, what a chart is
 * doing. The caller supplies its own heading level, because a panel's fold and
 * a card's fold are the same control at two different sizes.
 */
export function Fold({
  title,
  summary,
  beneath,
  open,
  onToggle,
  children,
}: {
  title: ReactNode;
  summary: ReactNode;
  /**
   * Rendered under the head whether or not the fold is open. For the thing to
   * do about what the head says — which belongs with the sentence, not at the
   * bottom of the body it opens onto, and cannot live inside the head because
   * the head is a button and buttons do not nest.
   */
  beneath?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <button type="button" className="fold-head" aria-expanded={open} onClick={onToggle}>
        <span className="fold-title">
          {title}
          {summary}
        </span>
        <Icon name="chevron" />
      </button>
      {beneath}
      {open ? children : null}
    </>
  );
}

export function Note({ icon = "info", children }: { icon?: string; children: ReactNode }) {
  return (
    <div className="note">
      <Icon name={icon} />
      <p>{children}</p>
    </div>
  );
}

/**
 * A destructive action that asks once. The second press within a few seconds
 * commits; anything else lets it lapse back to its resting state.
 */
export function ConfirmButton({
  label,
  confirmLabel = "Confirm",
  className = "row-action danger",
  icon = "trash",
  onConfirm,
}: {
  label: string;
  confirmLabel?: string;
  className?: string;
  icon?: string;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 4_000);
    return () => window.clearTimeout(timer);
  }, [armed]);

  return (
    <button
      type="button"
      className={armed ? `${className} armed` : className}
      aria-label={armed ? `${confirmLabel}: ${label}` : label}
      title={label}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onConfirm();
      }}
      onBlur={() => setArmed(false)}
    >
      <Icon name={armed ? "check" : icon} />
      <span>{armed ? confirmLabel : label}</span>
    </button>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ModalFrame({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  const headingId = useId();

  // The page supplies inline close callbacks. Keep the listener current without
  // tearing down the focus trap (and losing the original opener) on every save.
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus the dialog itself: a screen reader then announces the title before
    // the first control, and Tab still lands on that control next.
    const node = panel.current;
    node?.focus();

    /** Keeps Tab inside the dialog so the page behind it never takes focus. */
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close.current();
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const focusable = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      );
      if (!focusable.length) return;
      const edge = event.shiftKey ? focusable[0] : focusable.at(-1)!;
      if (document.activeElement === edge || !node.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? focusable.at(-1)! : focusable[0]).focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prior;
      document.removeEventListener("keydown", onKeyDown);
      opener?.focus?.();
    };
  }, []);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby={headingId} ref={panel} tabIndex={-1}>
        <div className="modal-head">
          <div>
            <h2 id={headingId}>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({
  name,
  label,
  suffix,
  value,
  min,
  max,
  step = "1",
  onChange,
}: {
  name: string;
  label: string;
  suffix?: string;
  value?: number | null | string;
  min?: string;
  max?: string;
  step?: string;
  onChange?: (value: string) => void;
}) {
  const id = useId();
  const controlled = onChange !== undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-suffix">
        <input
          id={id}
          type="number"
          name={name}
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          {...(controlled
            ? { value: value ?? "", onChange: (event) => onChange(event.target.value) }
            : { defaultValue: value ?? "" })}
        />
        {suffix ? <small>{suffix}</small> : null}
      </div>
    </div>
  );
}

export function TextField({
  name,
  label,
  value,
  placeholder,
  type = "text",
  required,
  onChange,
}: {
  name: string;
  label: string;
  value?: string;
  placeholder?: string;
  type?: "text" | "date" | "time";
  required?: boolean;
  onChange?: (value: string) => void;
}) {
  const id = useId();
  const controlled = onChange !== undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        name={name}
        placeholder={placeholder}
        required={required}
        {...(controlled
          ? { value: value ?? "", onChange: (event) => onChange(event.target.value) }
          : { defaultValue: value ?? "" })}
      />
    </div>
  );
}

export function TextAreaField({
  name,
  label,
  value,
  placeholder,
  rows = 3,
}: {
  name: string;
  label: string;
  value?: string;
  placeholder?: string;
  rows?: number;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} name={name} rows={rows} placeholder={placeholder} defaultValue={value} />
    </div>
  );
}

export function NumberSetting({
  label,
  detail,
  value,
  min,
  max,
  step,
  optional,
  onChange,
}: {
  label: string;
  detail: string;
  value: number | string;
  min: number;
  max: number;
  step: number;
  optional?: boolean;
  onChange: (value: number | "") => void;
}) {
  const id = useId();
  return (
    <div className="setting-row">
      <label htmlFor={id}>
        <b>{label}</b>
        <small>
          {detail}
          {optional ? " · optional" : ""}
        </small>
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))}
      />
    </div>
  );
}

export function SelectSetting({
  label,
  detail,
  value,
  options,
  onChange,
}: {
  label: string;
  detail: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="setting-row">
      <label htmlFor={id}>
        <b>{label}</b>
        <small>{detail}</small>
      </label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
