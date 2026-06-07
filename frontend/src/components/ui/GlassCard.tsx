import React from "react";
import { cn } from "../../lib/utils";

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  glow?: boolean;
  height?: string;
}

export function GlassCard({ children, glow = false, height, className, ...props }: GlassCardProps) {
  return (
    <div
      className={cn(
        "glass-panel rounded-[1.25rem] p-5 sm:p-6 transition-all duration-300",
        "bg-white/80 backdrop-blur-xl border border-white/40 shadow-[0_8px_32px_rgba(0,0,0,0.04),inset_0_1px_1px_rgba(255,255,255,0.7)]",
        "dark:bg-slate-900/60 dark:border-white/10 dark:shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.05)]",
        glow && "glass-glow shadow-[0_0_40px_-12px_var(--glass-glow-color),0_20px_60px_-20px_rgba(0,0,0,0.25)] dark:shadow-[0_0_40px_-12px_var(--glass-glow-color),0_20px_60px_-20px_rgba(0,0,0,0.5)]",
        className
      )}
      style={{ height }}
      {...props}
    >
      {children}
    </div>
  );
}

export function GlassHeader({ title, subtitle, className }: { title: string, subtitle?: string, className?: string }) {
  return (
    <div className={cn("mb-4 border-b border-border pb-3 sm:mb-6 sm:pb-4", className)}>
      <div className="eyebrow mb-1 text-primary/80">{subtitle || "系统模块"}</div>
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
    </div>
  );
}
