import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ModuleSectionNavItem {
  id: string;
  label: string;
  description?: string;
}

interface ModuleSectionNavProps {
  title: string;
  items: ModuleSectionNavItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
  behavior?: "select" | "scroll";
  rightSlot?: ReactNode;
  className?: string;
}

export function ModuleSectionNav({ title, items, activeId, onSelect, behavior = "scroll", rightSlot, className }: ModuleSectionNavProps) {
  const handleSelect = (id: string) => {
    onSelect?.(id);
    if (behavior === "scroll") {
      document.getElementById(id)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  return (
    <div className={cn("space-y-2.5", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-bold tracking-wide text-slate-600 dark:text-slate-300">
          {title}
        </div>
        {rightSlot}
      </div>
      <div className="flex flex-nowrap gap-1 overflow-x-auto rounded-lg border border-slate-200/70 bg-slate-100/70 p-1 dark:border-white/10 dark:bg-white/[0.03] sm:flex-wrap sm:overflow-visible" role="tablist" aria-label={title}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            onClick={() => handleSelect(item.id)}
            aria-selected={activeId === item.id}
            aria-controls={item.id}
            className={cn(
              "min-w-0 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
              activeId === item.id
                ? "bg-sky-400 text-slate-950 shadow-sm shadow-sky-500/15"
                : "text-slate-500 hover:bg-white/75 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-slate-100"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
