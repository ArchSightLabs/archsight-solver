import * as React from "react"

import { cn } from "@/lib/utils"

export interface InputProps extends React.ComponentProps<"input"> {
  compact?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, id, name, compact, ...props }, ref) => {
    const generatedId = React.useId().replace(/:/g, "")
    const inputId = id ?? `input-${generatedId}`

    return (
      <input
        id={inputId}
        name={name ?? inputId}
        type={type}
        className={cn(
          "flex w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          compact ? "h-7 px-2 py-0.5 text-xs md:text-xs" : "h-9",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
