import { useState } from "react";
import { Input } from "./input";

interface DeferredIdInputProps {
  ariaLabel: string;
  value: string;
  onCommit: (nextId: string) => void;
  className?: string;
}

export function DeferredIdInput({ ariaLabel, value, onCommit, className }: DeferredIdInputProps) {
  const [draft, setDraft] = useState(value);

  const commitDraft = () => {
    const nextId = draft.trim();
    if (!nextId) {
      setDraft(value);
      return;
    }
    if (nextId !== value) {
      onCommit(nextId);
    }
  };

  return (
    <Input
      aria-label={ariaLabel}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commitDraft}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
      className={className}
    />
  );
}
