import React from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface ToggleGroupProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: {
    label: string;
    value: string;
    icon: LucideIcon;
    description?: string;
  }[];
  className?: string;
}

export const ToggleGroup: React.FC<ToggleGroupProps> = ({
  label,
  value,
  onChange,
  options,
  className
}) => {
  const labelId = React.useId();

  return (
    <div className={cn("space-y-2.5", className)}>
      <div id={labelId} className="block text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--text-muted)] px-1">
        {label}
      </div>
      <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby={labelId}>
        {options.map((option) => {
          const isActive = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isActive}
              onClick={() => onChange(option.value)}
              className={cn(
                "cursor-pointer relative flex flex-col items-center justify-center gap-2 p-3 rounded-xl border transition-all duration-300 overflow-hidden group",
                isActive
                  ? "bg-teal-500/10 border-teal-500/50 text-teal-400"
                  : "bg-[var(--bg-card)]/30 border-[var(--border-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card)]/50 hover:border-[var(--text-muted)]/30"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId={`${label}-active`}
                  className="absolute inset-0 bg-teal-500/5 z-0"
                  initial={false}
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <option.icon size={18} className={cn("relative z-10", isActive ? "scale-110" : "opacity-60 grayscale group-hover:grayscale-0 group-hover:opacity-100")} />
              <span className={cn("relative z-10 text-[10px] font-bold tracking-wider", isActive ? "text-teal-300" : "text-[var(--text-muted)]")}>
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
