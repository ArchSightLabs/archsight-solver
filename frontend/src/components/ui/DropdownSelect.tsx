import * as React from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";

import { cn } from "@/lib/utils";

export interface DropdownOption {
  value: string;
  label: string;
  selectedLabel?: string;
  description?: string;
  badge?: string;
}

interface DropdownSelectProps {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  className?: string;
  menuClassName?: string;
  optionClassName?: string;
  placeholder?: string;
  fallbackSelectedLabel?: string;
  menuMaxHeight?: number;
  ariaLabel?: string;
  compact?: boolean;
}

export function DropdownSelect({
  value,
  options,
  onChange,
  className,
  menuClassName,
  optionClassName,
  placeholder = "请选择",
  fallbackSelectedLabel,
  menuMaxHeight = 320,
  ariaLabel,
  compact = false,
}: DropdownSelectProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const listboxId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [menuStyle, setMenuStyle] = React.useState<React.CSSProperties | null>(null);

  const selected = options.find((option) => option.value === value) ?? null;
  const selectedDisplayLabel = selected?.selectedLabel ?? selected?.label ?? fallbackSelectedLabel ?? placeholder;
  const ariaValueLabel = selected?.label ?? fallbackSelectedLabel ?? placeholder;
  const hasOptionDescriptions = options.some((option) => option.description);

  React.useLayoutEffect(() => {
    if (!open || !rootRef.current) {
      return;
    }

    const updateMenuStyle = () => {
      if (!rootRef.current) return;
      const rect = rootRef.current.getBoundingClientRect();
      const viewportPadding = 12;
      const gap = 8;
      const preferredTop = rect.bottom + gap;
      const spaceBelow = window.innerHeight - preferredTop - viewportPadding;
      const spaceAbove = rect.top - gap - viewportPadding;
      const opensAbove = spaceBelow < 160 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(120, Math.min(menuMaxHeight, Math.max(spaceBelow, spaceAbove)));
      const availableWidth = window.innerWidth - viewportPadding * 2;
      const width = Math.min(Math.max(rect.width, hasOptionDescriptions ? 260 : 160), availableWidth);
      const left = Math.min(Math.max(rect.left, viewportPadding), window.innerWidth - width - viewportPadding);
      setMenuStyle({
        position: "fixed",
        top: opensAbove ? Math.max(viewportPadding, rect.top - gap - maxHeight) : preferredTop,
        left,
        width,
        maxWidth: availableWidth,
        maxHeight,
        overflowX: "hidden",
        overflowY: "auto",
        boxSizing: "border-box",
        zIndex: 10000,
      });
    };

    updateMenuStyle();
    window.addEventListener("resize", updateMenuStyle);
    window.addEventListener("scroll", updateMenuStyle, true);

    return () => {
      window.removeEventListener("resize", updateMenuStyle);
      window.removeEventListener("scroll", updateMenuStyle, true);
    };
  }, [hasOptionDescriptions, menuMaxHeight, open, value, options.length]);

  React.useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as globalThis.Node | null;
      const inRoot = target ? rootRef.current?.contains(target) : false;
      const inMenu = target ? menuRef.current?.contains(target) : false;
      if (!inRoot && !inMenu) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const choose = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel ? `${ariaLabel}，当前值：${ariaValueLabel}` : undefined}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-md border border-white/10 text-left font-medium outline-none transition-colors",
          compact ? "h-7 px-2 text-xs" : "h-10 px-3 text-sm",
          "bg-white/75 text-slate-950 shadow-sm hover:border-sky-300/70 hover:bg-white/90 focus-visible:ring-1 focus-visible:ring-sky-200/50",
          "dark:border-white/10 dark:bg-slate-950/60 dark:text-slate-100 dark:hover:border-sky-400/40 dark:hover:bg-slate-900/80",
          className
        )}
      >
        <span className="truncate">{selectedDisplayLabel}</span>
        <ChevronDown size={16} className={cn("shrink-0 opacity-70 transition-transform", open && "rotate-180")} />
      </button>

      {open && menuStyle
        ? createPortal(
            <div
              id={listboxId}
              ref={menuRef}
              role="listbox"
              style={menuStyle}
              className={cn(
                "rounded-xl border shadow-2xl backdrop-blur-md",
                "border-slate-200/90 bg-white text-slate-900",
                "dark:border-white/10 dark:bg-slate-950 dark:text-slate-100",
                menuClassName
              )}
            >
              {options.map((option, index) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => choose(option.value)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 text-left transition-colors",
                      compact ? "px-3 py-1.5 text-xs" : "px-4 py-3 text-sm",
                      "text-slate-700 hover:bg-sky-50 hover:text-sky-700",
                      "dark:text-slate-200 dark:hover:bg-white/8 dark:hover:text-sky-300",
                      index !== 0 && "border-t border-slate-200/70 dark:border-white/8",
                      isSelected && "bg-slate-100 font-semibold text-slate-950 dark:bg-white/10 dark:text-white",
                      optionClassName
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{option.label}</span>
                      {option.description ? (
                        <span className="mt-0.5 block whitespace-normal text-xs font-normal leading-snug text-slate-500 dark:text-slate-400">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {option.badge ? (
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200">
                          {option.badge}
                        </span>
                      ) : null}
                      {isSelected ? <Check size={14} className="shrink-0" /> : <span className="w-3.5" />}
                    </span>
                  </button>
                );
              })}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
