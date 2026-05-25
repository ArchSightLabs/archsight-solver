import React from 'react';
import { cn } from '@/lib/utils';

interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  className?: string;
}

export const InputField: React.FC<InputFieldProps> = ({
  label,
  className,
  id,
  ...props
}) => {
  const inputId = id || `input-${label.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div className={cn("space-y-1.5 w-full", className)}>
      <label
        htmlFor={inputId}
        className="block text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]"
      >
        {label}
      </label>
      <input
        id={inputId}
        className={cn(
          "w-full rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)]/50 px-4 py-2.5 text-sm text-[var(--text-main)] transition-all",
          "placeholder:text-slate-500 focus:border-[var(--primary)] focus:outline-none focus:ring-4 focus:ring-[var(--primary)]/10",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
        {...props}
      />
    </div>
  );
};
