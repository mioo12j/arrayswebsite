import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Merge conditional class names (clsx) and de-dupe conflicting Tailwind
// utilities (twMerge). Used by shadcn/ui components.
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
