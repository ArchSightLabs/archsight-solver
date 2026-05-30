export interface RenameEditResult<T> {
  next: T;
  previousId: string;
  nextId: string;
  renamed: boolean;
}

export function canonicalEditorId(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}
