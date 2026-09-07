import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn's class merger: clsx resolves conditionals, tailwind-merge lets a
 *  caller's `px-6` beat a variant's `px-4` instead of both landing in the
 *  class list and the cascade picking by declaration order. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
