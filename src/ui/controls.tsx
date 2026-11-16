import { useId, useState, type ReactNode } from 'react';
import { fmtNum } from './theme';

/** Collapsible sidebar section. */
export function Section({ title, open, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="section" open={open}>
      <summary>{title}</summary>
      <div className="section-body">{children}</div>
    </details>
  );
}

interface NumberInputProps {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  integer?: boolean;
  width?: string;
}

/**
 * Number input that keeps the typed text while editing (so "1e" or "0." are allowed) and
 * commits every valid number. Accepts scientific notation like 1e5.
 */
export function NumberInput({ value, onChange, disabled, id, ariaLabel, integer, width }: NumberInputProps) {
  // While focused, show what the user types; otherwise the formatted value.
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const parse = (s: string) => {
    const v = Number(s.trim());
    if (s.trim() === '' || !Number.isFinite(v)) return null;
    return integer ? Math.round(v) : v;
  };
  return (
    <input
      id={id}
      aria-label={ariaLabel}
      className="num"
      type="text"
      inputMode="decimal"
      style={width ? { width } : undefined}
      value={focused ? text : fmtNum(value, 4)}
      disabled={disabled}
      onFocus={() => {
        setText(fmtNum(value, 4));
        setFocused(true);
      }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setText(e.target.value);
        const v = parse(e.target.value);
        if (v !== null) onChange(v);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

interface FieldProps {
  label: string;
  unit?: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}

export function Field({ label, unit, hint, children, htmlFor }: FieldProps) {
  return (
    <div className="field">
      <label htmlFor={htmlFor} title={hint}>
        {label}
        {unit && <span className="unit"> [{unit}]</span>}
      </label>
      <div className="field-control">{children}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function NumberField(props: Omit<FieldProps, 'children' | 'htmlFor'> & NumberInputProps) {
  const id = useId();
  const { label, unit, hint, ...input } = props;
  return (
    <Field label={label} unit={unit} hint={hint} htmlFor={id}>
      <NumberInput id={id} {...input} />
    </Field>
  );
}

interface SliderProps extends Omit<FieldProps, 'children' | 'htmlFor'> {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  /** Step of the slider (in log10 units for log sliders). */
  step?: number;
  log?: boolean;
  integer?: boolean;
  disabled?: boolean;
}

/** Slider plus a number box. The box accepts values outside the slider range. */
export function SliderField({ label, unit, hint, value, onChange, min, max, step, log, integer, disabled }: SliderProps) {
  const id = useId();
  const toPos = (v: number) => (log ? Math.log10(Math.max(v, 1e-300)) : v);
  const fromPos = (p: number) => {
    const v = log ? 10 ** p : p;
    return integer ? Math.round(v) : Number(v.toPrecision(3));
  };
  const lo = toPos(min);
  const hi = toPos(max);
  return (
    <Field label={label} unit={unit} hint={hint} htmlFor={id}>
      <input
        type="range"
        className="slider"
        aria-label={label}
        min={lo}
        max={hi}
        step={step ?? (log ? 0.05 : (hi - lo) / 200)}
        value={Math.min(hi, Math.max(lo, toPos(value)))}
        disabled={disabled}
        onChange={(e) => onChange(fromPos(Number(e.target.value)))}
      />
      <NumberInput id={id} value={value} onChange={onChange} integer={integer} disabled={disabled} width="6.5em" />
    </Field>
  );
}

interface SelectProps<T extends string | number> extends Omit<FieldProps, 'children' | 'htmlFor'> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}

export function SelectField<T extends string | number>({ label, unit, hint, value, options, onChange, disabled }: SelectProps<T>) {
  const id = useId();
  return (
    <Field label={label} unit={unit} hint={hint} htmlFor={id}>
      <select
        id={id}
        value={String(value)}
        disabled={disabled}
        onChange={(e) => {
          const o = options.find((o) => String(o.value) === e.target.value);
          if (o) onChange(o.value);
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function CheckboxField({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="field checkbox">
      <label title={hint}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}
      </label>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
