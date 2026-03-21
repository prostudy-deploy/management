import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Timestamp } from "firebase/firestore";
import { format, formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(timestamp: Timestamp | null): string {
  if (!timestamp) return "—";
  return format(timestamp.toDate(), "dd.MM.yyyy", { locale: de });
}

export function formatDateTime(timestamp: Timestamp | null): string {
  if (!timestamp) return "—";
  return format(timestamp.toDate(), "dd.MM.yyyy HH:mm", { locale: de });
}

export function formatRelative(timestamp: Timestamp | null): string {
  if (!timestamp) return "—";
  return formatDistanceToNow(timestamp.toDate(), { addSuffix: true, locale: de });
}
