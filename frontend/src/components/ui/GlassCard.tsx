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
        "glass-panel rounded-2xl p-6 transition-all duration-300",
        glow && "glass-glow",
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
