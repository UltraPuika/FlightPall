import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-2xl border border-slate-200/80 bg-white shadow-sm', className)}>{children}</div>;
}

export function Section({ step, title, hint, children, icon }: { step?: number; title: string; hint?: ReactNode; children: ReactNode; icon?: ReactNode }) {
  return (
    <section className="border-b border-slate-100 px-5 py-5 last:border-b-0">
      <header className="mb-3 flex items-start gap-3">
        {step !== undefined && (
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">{step}</span>
        )}
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            {icon}
            {title}
          </h3>
          {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <label htmlFor={id} className={cx('flex cursor-pointer items-start gap-3 py-1', disabled && 'cursor-not-allowed opacity-50')}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 inline-flex h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-brand-600' : 'bg-slate-300')}
      >
        <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0.5')} />
      </button>
      <span className="min-w-0 text-sm">
        <span className="text-slate-800">{label}</span>
        {description && <span className="block text-xs text-slate-500">{description}</span>}
      </span>
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl bg-slate-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
            value === o.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children, hint, className }: { label: ReactNode; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputBase =
  'rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-xs placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50';
export const inputClass = `w-full ${inputBase}`;
/** Use the base style when the caller sets its own width class */
const withWidth = (className?: string) => (className && /(^|\s)w-/.test(className) ? cx(inputBase, className) : cx(inputClass, className));

export function NumberInput({ value, onChange, min, max, step, placeholder, allowEmpty, className, ariaLabel }: {
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  allowEmpty?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="number"
      inputMode="decimal"
      aria-label={ariaLabel}
      className={withWidth(className)}
      value={draft ?? (value === null ? '' : String(value))}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        if (raw === '') {
          if (allowEmpty) onChange(null);
          return;
        }
        const n = Number(raw);
        if (Number.isFinite(n)) onChange(n);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

export function Stepper({ value, onChange, min, max, label }: { value: number; onChange: (v: number) => void; min: number; max: number; label: string }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button type="button" className="h-8 w-8 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Decrease ${label}`}>
        −
      </button>
      <span className="w-8 text-center text-sm font-semibold tabular" aria-live="polite">
        {value}
      </span>
      <button type="button" className="h-8 w-8 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`Increase ${label}`}>
        +
      </button>
    </div>
  );
}

export function Collapsible({ title, children, defaultOpen = false, badge }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; badge?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-semibold text-slate-900 hover:bg-slate-50">
        <span className="flex items-center gap-2">
          {title}
          {badge}
        </span>
        <ChevronDown className={cx('h-4 w-4 text-slate-500 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="animate-fade-in px-5 pb-5">{children}</div>}
    </div>
  );
}

const BADGE_TONES = {
  slate: 'bg-slate-100 text-slate-700',
  brand: 'bg-brand-50 text-brand-700 ring-1 ring-brand-200',
  amber: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
  rose: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
  violet: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  sky: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
} as const;

export function Badge({ children, tone = 'slate', title }: { children: ReactNode; tone?: keyof typeof BADGE_TONES; title?: string }) {
  return (
    <span title={title} className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium', BADGE_TONES[tone])}>
      {children}
    </span>
  );
}

export function Button({ children, onClick, variant = 'secondary', type = 'button', disabled, className, title }: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  type?: 'button' | 'submit';
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  const styles = {
    primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 disabled:bg-slate-300',
    secondary: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-50',
    ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50',
    danger: 'border border-rose-200 bg-white text-rose-700 hover:bg-rose-50',
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} className={cx('inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors', styles, className)}>
      {children}
    </button>
  );
}
