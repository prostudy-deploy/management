import { Timestamp } from "firebase/firestore";

// --- Rollen ---
export type UserRole = "admin" | "marketing" | "verwaltung";

// --- User ---
export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  hourlyRate: number; // Stundenlohn in EUR
  createdAt: Timestamp;
}

// --- Zeiterfassung ---
export interface ActiveTimer {
  uid: string;
  startedAt: Timestamp;
}

export interface TimeEntry {
  id: string;
  uid: string;
  startedAt: Timestamp;
  stoppedAt: Timestamp;
  durationMinutes: number;
  earned: number; // Verdienst basierend auf Stundenlohn
}

// --- Berechtigungen ---
// Admin: alles
// Verwaltung: wie Admin, ABER kann keine Benutzer hinzufügen und keine Abrechnungen einsehen
// Marketing: nur eigene Aufgaben
export function canManageTasks(role: UserRole | null): boolean {
  return role === "admin" || role === "verwaltung";
}

export function canManageTeam(role: UserRole | null): boolean {
  return role === "admin";
}

export function canViewBilling(role: UserRole | null): boolean {
  return role === "admin";
}

// --- Aufgaben ---
export type TaskStatus =
  | "created"
  | "assigned"
  | "in_progress"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected";

export type TaskPriority = "low" | "medium" | "high";
export type TaskCategory = "marketing" | "verwaltung" | "sonstiges";

export type LinkType = "meeting" | "canva" | "document" | "other";

export interface TaskLink {
  url: string;
  label: string;
  type: LinkType;
}

export interface TaskAttachment {
  name: string;
  url: string;
  storagePath: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  assignedTo: string | null;
  createdBy: string;
  status: TaskStatus;
  priority: TaskPriority;
  category: TaskCategory;
  projectId: string | null;
  deadline: Timestamp | null;
  links: TaskLink[];
  attachments: TaskAttachment[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// --- Abgaben ---
export type AiStatus = "pending" | "completed" | "error";

export interface AiFeedback {
  summary: string;
  strengths: string[];
  improvements: string[];
  score: number | null;
  generatedAt: Timestamp;
}

export interface Submission {
  id: string;
  taskId: string;
  submittedBy: string;
  content: string;
  attachments: TaskAttachment[];
  aiFeedback: AiFeedback | null;
  aiStatus: AiStatus;
  submittedAt: Timestamp;
}

// --- Bewertungen ---
export type ReviewDecision = "approved" | "rejected" | "revision_requested";

export interface Review {
  id: string;
  taskId: string;
  submissionId: string;
  reviewedBy: string;
  decision: ReviewDecision;
  feedback: string;
  reviewedAt: Timestamp;
}

// --- Budget ---
export interface BudgetEntry {
  id: string;
  description: string;
  amount: number;
  date: Timestamp;
  taskId?: string;
  createdBy: string;
}

export interface Budget {
  id: string;
  title: string;
  category: string;
  totalBudget: number;
  spent: number;
  entries: BudgetEntry[];
  createdBy: string;
  projectId: string | null;
  period: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// --- Projekte ---
export type ProjectStatus = "active" | "completed" | "archived";

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  color: string; // Hex-Farbe für UI
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Aktiv",
  completed: "Abgeschlossen",
  archived: "Archiviert",
};

export const PROJECT_COLORS = [
  { value: "#3B82F6", label: "Blau" },
  { value: "#10B981", label: "Grün" },
  { value: "#F59E0B", label: "Gelb" },
  { value: "#EF4444", label: "Rot" },
  { value: "#8B5CF6", label: "Lila" },
  { value: "#EC4899", label: "Pink" },
  { value: "#06B6D4", label: "Cyan" },
  { value: "#F97316", label: "Orange" },
];

// --- Einladungen ---
export interface Invitation {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: "pending" | "activated";
  createdAt: Timestamp;
  activatedAt?: Timestamp;
}

// --- Status Labels (Deutsch) ---
export const STATUS_LABELS: Record<TaskStatus, string> = {
  created: "Erstellt",
  assigned: "Zugewiesen",
  in_progress: "In Bearbeitung",
  submitted: "Eingereicht",
  under_review: "Wird geprüft",
  approved: "Freigegeben",
  rejected: "Abgelehnt",
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Niedrig",
  medium: "Mittel",
  high: "Hoch",
};

export const CATEGORY_LABELS: Record<TaskCategory, string> = {
  marketing: "Marketing",
  verwaltung: "Verwaltung",
  sonstiges: "Sonstiges",
};

export const LINK_TYPE_LABELS: Record<LinkType, string> = {
  meeting: "Meeting",
  canva: "Canva",
  document: "Dokument",
  other: "Sonstiges",
};

// --- Chat ---
export interface ChatGroup {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  members: string[]; // UIDs, leer = alle
  createdAt: Timestamp;
}

export interface ChatMention {
  type: "task" | "user" | "file";
  id: string;
  label: string; // Anzeigename
  url?: string; // Für file-Mentions
  taskTitle?: string; // Für file-Mentions: zugehörige Aufgabe
}

export interface ChatMessage {
  id: string;
  uid: string;
  groupId: string;
  displayName: string;
  content: string;
  attachments: TaskAttachment[];
  mentions: ChatMention[];
  createdAt: Timestamp;
  editedAt?: Timestamp;
}
