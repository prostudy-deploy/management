"use client";

import { useAuth } from "@/context/AuthContext";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { useEffect, useState, useMemo } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  getDocs,
  Timestamp,
  orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";
import {
  CalendarEvent,
  CalendarCategory,
  CALENDAR_CATEGORY_LABELS,
  Task,
  Project,
  AppUser,
  TaskAttachment,
  CALENDAR_COLORS,
  canManageTasks,
} from "@/lib/types";
import { Card, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { FileUpload, FileList } from "@/components/ui/FileUpload";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Clock,
  CalendarDays,
  Trash2,
  Pencil,
  Save,
  Link2,
  Paperclip,
  Video,
  ExternalLink,
} from "lucide-react";

export default function KalenderPage() {
  return (
    <AuthGuard>
      <KalenderContent />
    </AuthGuard>
  );
}

// --- Helpers ---
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" });
}

function getWeekDays(d: Date): Date[] {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  const monday = new Date(d.getFullYear(), d.getMonth(), diff);
  return Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
}

function getMonthDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDay = first.getDay() === 0 ? 6 : first.getDay() - 1; // Monday=0
  const days: Date[] = [];
  // Previous month padding
  for (let i = startDay - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i));
  }
  // Current month
  for (let i = 1; i <= last.getDate(); i++) {
    days.push(new Date(year, month, i));
  }
  // Next month padding
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    days.push(new Date(year, month + 1, i));
  }
  return days;
}

const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTH_LABELS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

// --- Main Component ---
function KalenderContent() {
  const { user, role } = useAuth();
  const today = useMemo(() => startOfDay(new Date()), []);

  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMode, setViewMode] = useState<"day" | "week">("day");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [deadlineEvents, setDeadlineEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Form
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formTime, setFormTime] = useState("09:00");
  const [formEndTime, setFormEndTime] = useState("10:00");
  const [formAllDay, setFormAllDay] = useState(false);
  const [formColor, setFormColor] = useState("#3B82F6");
  const [formCategory, setFormCategory] = useState<CalendarCategory>("termin");
  const [formMeetingLink, setFormMeetingLink] = useState("");
  const [formAssignedTo, setFormAssignedTo] = useState<string[]>([]);
  const [formTaskId, setFormTaskId] = useState("");
  const [formAttachments, setFormAttachments] = useState<TaskAttachment[]>([]);

  // Data
  const [teamMembers, setTeamMembers] = useState<AppUser[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  // Detail
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  // Load data
  useEffect(() => {
    async function loadData() {
      if (!user) return;

      // Events laden
      const evSnap = await getDocs(query(collection(db, "calendarEvents"), orderBy("date", "asc")));
      const loadedEvents = evSnap.docs.map((d) => ({ id: d.id, ...d.data() } as CalendarEvent));

      // Filter: Nur eigene Events oder Manager sieht alle
      const filteredEvents = canManageTasks(role)
        ? loadedEvents
        : loadedEvents.filter((e) => {
            const assigned = Array.isArray(e.assignedTo) ? e.assignedTo : [e.assignedTo];
            return assigned.includes(user.uid) || e.createdBy === user.uid;
          });
      setEvents(filteredEvents);

      // Team laden
      const usersSnap = await getDocs(query(collection(db, "users"), where("isActive", "==", true)));
      setTeamMembers(usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser)));

      // Tasks mit Deadlines laden
      let taskQuery;
      if (canManageTasks(role)) {
        taskQuery = query(collection(db, "tasks"));
      } else {
        taskQuery = query(collection(db, "tasks"), where("assignedTo", "==", user.uid));
      }
      const tasksSnap = await getDocs(taskQuery);
      const loadedTasks = tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Task));
      setTasks(loadedTasks);

      // Projekte laden
      const projSnap = await getDocs(collection(db, "projects"));
      const loadedProjects = projSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Project));
      setProjects(loadedProjects);

      // Deadlines als Events
      const deadlines: CalendarEvent[] = loadedTasks
        .filter((t) => t.deadline && t.status !== "approved")
        .map((t) => {
          const proj = t.projectId ? loadedProjects.find((p) => p.id === t.projectId) : null;
          return {
            id: `deadline_${t.id}`,
            title: `Deadline: ${t.title}`,
            description: t.description,
            category: "deadline" as CalendarCategory,
            date: t.deadline!,
            allDay: true,
            color: proj?.color || "#EF4444",
            assignedTo: t.assignedTo ? [t.assignedTo] : [],
            createdBy: t.createdBy,
            taskId: t.id,
            projectId: t.projectId || null,
            attachments: [],
            isDeadline: true,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
          } as CalendarEvent;
        });
      setDeadlineEvents(deadlines);

      setLoading(false);
    }
    loadData();
  }, [user, role]);

  // All events combined
  const allEvents = useMemo(() => [...events, ...deadlineEvents], [events, deadlineEvents]);

  // Events for selected date
  const dayEvents = useMemo(() => {
    return allEvents
      .filter((e) => {
        const eDate = e.date?.toDate?.();
        return eDate && isSameDay(eDate, selectedDate);
      })
      .sort((a, b) => {
        if (a.allDay && !b.allDay) return -1;
        if (!a.allDay && b.allDay) return 1;
        return (a.date?.toDate?.()?.getTime() || 0) - (b.date?.toDate?.()?.getTime() || 0);
      });
  }, [allEvents, selectedDate]);

  // Events for week
  const weekDays = useMemo(() => getWeekDays(selectedDate), [selectedDate]);
  const weekEvents = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    weekDays.forEach((d) => {
      const key = d.toISOString().split("T")[0];
      map[key] = allEvents
        .filter((e) => {
          const eDate = e.date?.toDate?.();
          return eDate && isSameDay(eDate, d);
        })
        .sort((a, b) => {
          if (a.allDay && !b.allDay) return -1;
          if (!a.allDay && b.allDay) return 1;
          return (a.date?.toDate?.()?.getTime() || 0) - (b.date?.toDate?.()?.getTime() || 0);
        });
    });
    return map;
  }, [allEvents, weekDays]);

  // Month calendar data
  const monthDays = useMemo(() => getMonthDays(viewYear, viewMonth), [viewYear, viewMonth]);

  // Has events for a day (for mini calendar dots)
  const hasEventsOnDay = (d: Date) => allEvents.some((e) => {
    const eDate = e.date?.toDate?.();
    return eDate && isSameDay(eDate, d);
  });

  // --- Actions ---
  const openCreateForm = (date?: Date) => {
    const d = date || selectedDate;
    setFormTitle("");
    setFormDescription("");
    setFormDate(d.toISOString().split("T")[0]);
    setFormTime("09:00");
    setFormEndTime("10:00");
    setFormAllDay(false);
    setFormColor("#3B82F6");
    setFormCategory("termin");
    setFormMeetingLink("");
    setFormAssignedTo(user?.uid ? [user.uid] : []);
    setFormTaskId("");
    setFormAttachments([]);
    setEditingEvent(null);
    setShowForm(true);
  };

  const openEditForm = (event: CalendarEvent) => {
    if (event.isDeadline) return;
    const d = event.date?.toDate?.();
    setFormTitle(event.title);
    setFormDescription(event.description);
    setFormDate(d ? d.toISOString().split("T")[0] : "");
    setFormTime(d ? formatTime(d) : "09:00");
    const ed = event.endDate?.toDate?.();
    setFormEndTime(ed ? formatTime(ed) : "10:00");
    setFormAllDay(event.allDay);
    setFormColor(event.color);
    setFormCategory(event.category || "termin");
    setFormMeetingLink(event.meetingLink || "");
    setFormAssignedTo(Array.isArray(event.assignedTo) ? event.assignedTo : [event.assignedTo]);
    setFormTaskId(event.taskId || "");
    setFormAttachments(event.attachments || []);
    setEditingEvent(event);
    setShowForm(true);
  };

  const canAssignOthers = canManageTasks(role);

  const saveEvent = async () => {
    if (!formTitle.trim() || !formDate || !user) return;

    const dateObj = new Date(formDate);
    if (!formAllDay) {
      const [h, m] = formTime.split(":").map(Number);
      dateObj.setHours(h, m, 0, 0);
    }

    let endDateObj: Date | null = null;
    if (!formAllDay && formEndTime) {
      endDateObj = new Date(formDate);
      const [eh, em] = formEndTime.split(":").map(Number);
      endDateObj.setHours(eh, em, 0, 0);
    }

    const eventData: Record<string, any> = {
      title: formTitle.trim(),
      description: formDescription.trim(),
      category: formCategory,
      date: Timestamp.fromDate(dateObj),
      endDate: endDateObj ? Timestamp.fromDate(endDateObj) : null,
      allDay: formAllDay,
      color: formCategory === "meeting" ? "#8B5CF6" : formColor,
      meetingLink: formCategory === "meeting" ? formMeetingLink.trim() || null : null,
      assignedTo: formAssignedTo.length > 0 ? formAssignedTo : [user.uid],
      taskId: formTaskId || null,
      projectId: formTaskId ? tasks.find((t) => t.id === formTaskId)?.projectId || null : null,
      attachments: formAttachments,
      isDeadline: false,
      updatedAt: Timestamp.now(),
    };

    try {
      if (editingEvent) {
        await updateDoc(doc(db, "calendarEvents", editingEvent.id), eventData);
        toast.success("Termin aktualisiert!");
      } else {
        eventData.createdBy = user.uid;
        eventData.createdAt = Timestamp.now();
        await addDoc(collection(db, "calendarEvents"), eventData);
        toast.success("Termin erstellt!");
      }
      // Neu laden statt lokales State-Update (Timestamps korrekt)
      const evSnap = await getDocs(query(collection(db, "calendarEvents"), orderBy("date", "asc")));
      const loadedEvents = evSnap.docs.map((d) => ({ id: d.id, ...d.data() } as CalendarEvent));
      const filteredEvents = canManageTasks(role)
        ? loadedEvents
        : loadedEvents.filter((e) => {
            const assigned = Array.isArray(e.assignedTo) ? e.assignedTo : [e.assignedTo];
            return assigned.includes(user.uid) || e.createdBy === user.uid;
          });
      setEvents(filteredEvents);
      setShowForm(false);
      setEditingEvent(null);
    } catch (err) {
      console.error(err);
      toast.error("Fehler beim Speichern.");
    }
  };

  const deleteEvent = async (eventId: string) => {
    try {
      await deleteDoc(doc(db, "calendarEvents", eventId));
      setEvents(events.filter((e) => e.id !== eventId));
      setSelectedEvent(null);
      toast.success("Termin gelöscht.");
    } catch (err) {
      console.error(err);
      toast.error("Fehler beim Löschen.");
    }
  };

  const navigateMonth = (delta: number) => {
    let newMonth = viewMonth + delta;
    let newYear = viewYear;
    if (newMonth > 11) { newMonth = 0; newYear++; }
    if (newMonth < 0) { newMonth = 11; newYear--; }
    setViewMonth(newMonth);
    setViewYear(newYear);
  };

  const goToToday = () => {
    setSelectedDate(today);
    setViewMonth(today.getMonth());
    setViewYear(today.getFullYear());
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  // --- Render Event Card ---
  const renderEventCard = (event: CalendarEvent, compact = false) => {
    const eDate = event.date?.toDate?.();
    const eEnd = event.endDate?.toDate?.();
    const assignedArr = Array.isArray(event.assignedTo) ? event.assignedTo : [event.assignedTo];
    const assigneeNames = assignedArr
      .map((uid) => teamMembers.find((m) => m.uid === uid)?.displayName)
      .filter(Boolean);
    const isDeadline = event.isDeadline;

    return (
      <div
        key={event.id}
        onClick={() => setSelectedEvent(event)}
        className={`rounded-lg border px-3 py-2 cursor-pointer transition-all hover:shadow-md ${
          isDeadline ? "border-red-200 bg-red-50/60" : "border-gray-100 hover:border-gray-200"
        } ${compact ? "py-1.5" : ""}`}
        style={{ borderLeftWidth: 3, borderLeftColor: event.color }}
      >
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <p className={`font-medium truncate ${compact ? "text-xs" : "text-sm"} text-gray-900 flex items-center gap-1`}>
              {event.category === "meeting" && <Video className="h-3 w-3 text-purple-600 shrink-0" />}
              {event.title}
            </p>
            {!compact && (
              <div className="flex items-center gap-2 mt-0.5">
                {!event.allDay && eDate && (
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTime(eDate)}
                    {eEnd && ` – ${formatTime(eEnd)}`}
                  </span>
                )}
                {event.allDay && (
                  <span className="text-xs text-gray-400">Ganztägig</span>
                )}
                {assigneeNames.length > 0 && (
                  <span className="text-xs text-gray-400">{assigneeNames.join(", ")}</span>
                )}
                {event.meetingLink && !compact && (
                  <a
                    href={event.meetingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-purple-600 hover:underline flex items-center gap-0.5"
                  >
                    <Video className="h-3 w-3" />
                    Meeting
                  </a>
                )}
              </div>
            )}
          </div>
          {event.taskId && (
            <Link2 className="h-3 w-3 text-gray-400 shrink-0" />
          )}
          {event.attachments?.length > 0 && (
            <Paperclip className="h-3 w-3 text-gray-400 shrink-0" />
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <CalendarDays className="h-6 w-6 text-blue-600" />
          Kalender
        </h1>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={goToToday}>
            Heute
          </Button>
          <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setViewMode("day")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === "day" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              Tag
            </button>
            <button
              onClick={() => setViewMode("week")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === "week" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              Woche
            </button>
          </div>
          <Button size="sm" onClick={() => openCreateForm()}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Termin
          </Button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Mini Month Calendar (mobile: top, desktop: left) */}
        <div className="lg:w-64 shrink-0">
          <Card>
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => navigateMonth(-1)} className="p-1 hover:bg-gray-100 rounded">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold text-gray-900">
                {MONTH_LABELS[viewMonth]} {viewYear}
              </span>
              <button onClick={() => navigateMonth(1)} className="p-1 hover:bg-gray-100 rounded">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 mb-1">
              {WEEKDAY_LABELS.map((d) => (
                <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
              ))}
            </div>

            {/* Days */}
            <div className="grid grid-cols-7">
              {monthDays.map((d, i) => {
                const isCurrentMonth = d.getMonth() === viewMonth;
                const isToday = isSameDay(d, today);
                const isSelected = isSameDay(d, selectedDate);
                const hasEvents = hasEventsOnDay(d);

                return (
                  <button
                    key={i}
                    onClick={() => {
                      setSelectedDate(d);
                      if (d.getMonth() !== viewMonth) {
                        setViewMonth(d.getMonth());
                        setViewYear(d.getFullYear());
                      }
                    }}
                    className={`relative h-8 w-full text-xs rounded-md transition-colors ${
                      isSelected
                        ? "bg-blue-600 text-white font-bold"
                        : isToday
                        ? "bg-blue-100 text-blue-700 font-semibold"
                        : isCurrentMonth
                        ? "text-gray-700 hover:bg-gray-100"
                        : "text-gray-300"
                    }`}
                  >
                    {d.getDate()}
                    {hasEvents && !isSelected && (
                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-blue-500" />
                    )}
                  </button>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Main Calendar View */}
        <div className="flex-1 min-w-0">
          {/* Day View */}
          {viewMode === "day" && (
            <div>
              {/* Day header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <button onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() - 1))} className="p-1 hover:bg-gray-100 rounded">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {selectedDate.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                  </h2>
                  <button onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + 1))} className="p-1 hover:bg-gray-100 rounded">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Events */}
              {dayEvents.length === 0 ? (
                <Card>
                  <p className="text-sm text-gray-500 text-center py-8">
                    Keine Termine oder Deadlines an diesem Tag.
                  </p>
                </Card>
              ) : (
                <div className="space-y-2">
                  {dayEvents.map((event) => renderEventCard(event))}
                </div>
              )}
            </div>
          )}

          {/* Week View */}
          {viewMode === "week" && (
            <div>
              {/* Week header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <button onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() - 7))} className="p-1 hover:bg-gray-100 rounded">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {formatDate(weekDays[0])} – {formatDate(weekDays[6])}
                  </h2>
                  <button onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + 7))} className="p-1 hover:bg-gray-100 rounded">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Week grid */}
              <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
                {weekDays.map((d) => {
                  const key = d.toISOString().split("T")[0];
                  const dayEvts = weekEvents[key] || [];
                  const isToday2 = isSameDay(d, today);
                  const isSelected2 = isSameDay(d, selectedDate);

                  return (
                    <div
                      key={key}
                      onClick={() => { setSelectedDate(d); setViewMode("day"); }}
                      className={`rounded-lg border p-2 min-h-[100px] cursor-pointer transition-colors ${
                        isSelected2
                          ? "border-blue-300 bg-blue-50/50"
                          : isToday2
                          ? "border-blue-200 bg-blue-50/30"
                          : "border-gray-100 hover:border-gray-200"
                      }`}
                    >
                      <div className={`text-xs font-medium mb-1.5 ${
                        isToday2 ? "text-blue-700" : "text-gray-500"
                      }`}>
                        {d.toLocaleDateString("de-DE", { weekday: "short", day: "numeric" })}
                      </div>
                      <div className="space-y-1">
                        {dayEvts.slice(0, 3).map((event) => renderEventCard(event, true))}
                        {dayEvts.length > 3 && (
                          <p className="text-xs text-gray-400 text-center">+{dayEvts.length - 3} weitere</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelectedEvent(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: selectedEvent.color }} />
                <h3 className="text-lg font-bold text-gray-900">{selectedEvent.title}</h3>
              </div>
              <button onClick={() => setSelectedEvent(null)} className="p-1 hover:bg-gray-100 rounded">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Datum/Zeit */}
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <CalendarDays className="h-4 w-4" />
                {selectedEvent.date?.toDate?.()?.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                {!selectedEvent.allDay && selectedEvent.date?.toDate?.() && (
                  <span className="flex items-center gap-1 ml-2">
                    <Clock className="h-3.5 w-3.5" />
                    {formatTime(selectedEvent.date.toDate())}
                    {selectedEvent.endDate?.toDate?.() && ` – ${formatTime(selectedEvent.endDate.toDate())}`}
                  </span>
                )}
                {selectedEvent.allDay && <span className="text-gray-400 ml-2">Ganztägig</span>}
              </div>

              {/* Zugewiesen */}
              {selectedEvent.assignedTo && (Array.isArray(selectedEvent.assignedTo) ? selectedEvent.assignedTo.length > 0 : selectedEvent.assignedTo) && (
                <p className="text-sm text-gray-500">
                  Für: <span className="font-medium text-gray-700">{
                    (Array.isArray(selectedEvent.assignedTo) ? selectedEvent.assignedTo : [selectedEvent.assignedTo])
                      .map((uid) => teamMembers.find((m) => m.uid === uid)?.displayName || "Unbekannt")
                      .join(", ")
                  }</span>
                </p>
              )}

              {/* Meeting Link */}
              {selectedEvent.meetingLink && (
                <a
                  href={selectedEvent.meetingLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-sm text-purple-700 hover:bg-purple-100 transition-colors"
                >
                  <Video className="h-4 w-4" />
                  Meeting beitreten
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}

              {/* Verknüpfte Aufgabe */}
              {selectedEvent.taskId && (
                <a href={`/aufgaben/${selectedEvent.taskId}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                  <Link2 className="h-3.5 w-3.5" />
                  Verknüpfte Aufgabe anzeigen
                </a>
              )}

              {/* Beschreibung */}
              {selectedEvent.description && (
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedEvent.description}</p>
              )}

              {/* Anhänge */}
              {selectedEvent.attachments && selectedEvent.attachments.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Anhänge:</p>
                  <FileList attachments={selectedEvent.attachments} />
                </div>
              )}

              {/* Deadline Badge */}
              {selectedEvent.isDeadline && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2.5 py-1 text-xs font-medium">
                  Aufgaben-Deadline
                </span>
              )}

              {/* Actions */}
              {!selectedEvent.isDeadline && (
                <div className="flex gap-2 pt-2 border-t border-gray-100">
                  {(selectedEvent.createdBy === user?.uid || canManageTasks(role)) && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => { setSelectedEvent(null); openEditForm(selectedEvent); }}>
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        Bearbeiten
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => deleteEvent(selectedEvent.id)}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Löschen
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">
                {editingEvent ? "Termin bearbeiten" : "Neuer Termin"}
              </h3>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  id="formTitle"
                  label="Titel"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder={formCategory === "meeting" ? "z.B. Team-Meeting" : "z.B. Besprechung"}
                />
                <Select
                  id="formCategory"
                  label="Kategorie"
                  value={formCategory}
                  onChange={(e) => {
                    const cat = e.target.value as CalendarCategory;
                    setFormCategory(cat);
                    if (cat === "meeting") setFormColor("#8B5CF6");
                  }}
                  options={[
                    { value: "termin", label: "Termin" },
                    { value: "meeting", label: "Meeting" },
                  ]}
                />
              </div>

              {formCategory === "meeting" && (
                <Input
                  id="formMeetingLink"
                  label="Meeting-Link (Google Meet, Zoom, etc.)"
                  type="url"
                  value={formMeetingLink}
                  onChange={(e) => setFormMeetingLink(e.target.value)}
                  placeholder="https://meet.google.com/..."
                />
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  id="formDate"
                  label="Datum"
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                />
                <div className="flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    id="formAllDay"
                    checked={formAllDay}
                    onChange={(e) => setFormAllDay(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="formAllDay" className="text-sm text-gray-700">Ganztägig</label>
                </div>
              </div>

              {!formAllDay && (
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    id="formTime"
                    label="Von"
                    type="time"
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                  />
                  <Input
                    id="formEndTime"
                    label="Bis"
                    type="time"
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                  />
                </div>
              )}

              <Textarea
                id="formDescription"
                label="Beschreibung (optional)"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={3}
                placeholder="Details zum Termin..."
              />

              {/* Farbe */}
              <div>
                <p className="text-xs font-medium text-gray-700 mb-1.5">Farbe</p>
                <div className="flex gap-1.5">
                  {CALENDAR_COLORS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setFormColor(c.value)}
                      className={`h-6 w-6 rounded-full border-2 transition-all ${
                        formColor === c.value ? "border-gray-900 scale-110" : "border-transparent"
                      }`}
                      style={{ backgroundColor: c.value }}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>

              {/* Zugewiesen an */}
              {canAssignOthers ? (
                <div>
                  <p className="text-xs font-medium text-gray-700 mb-1.5">Zugewiesen an</p>
                  <div className="border border-gray-200 rounded-lg p-2 max-h-36 overflow-y-auto space-y-1">
                    {teamMembers.map((m) => (
                      <label key={m.uid} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formAssignedTo.includes(m.uid)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormAssignedTo([...formAssignedTo, m.uid]);
                            } else {
                              setFormAssignedTo(formAssignedTo.filter((id) => id !== m.uid));
                            }
                          }}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-700">{m.displayName} <span className="text-gray-400">({m.role})</span></span>
                      </label>
                    ))}
                  </div>
                  {formAssignedTo.length === 0 && (
                    <p className="text-xs text-gray-400 mt-1">Mindestens eine Person auswählen</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-500">Termin für: <span className="font-medium">{teamMembers.find((m) => m.uid === user?.uid)?.displayName || "Dich"}</span></p>
              )}

              {/* Aufgabe verknüpfen */}
              <Select
                id="formTaskId"
                label="Mit Aufgabe verknüpfen (optional)"
                value={formTaskId}
                onChange={(e) => setFormTaskId(e.target.value)}
                options={[
                  { value: "", label: "Keine Verknüpfung" },
                  ...tasks.filter((t) => t.status !== "approved").map((t) => ({
                    value: t.id,
                    label: t.title,
                  })),
                ]}
              />

              {/* Dateien */}
              <div>
                <p className="text-xs font-medium text-gray-700 mb-1">Dateien anhängen (optional)</p>
                <FileUpload
                  storagePath="calendar"
                  attachments={formAttachments}
                  onChange={setFormAttachments}
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-2 pt-2">
                <Button onClick={saveEvent} disabled={!formTitle.trim() || !formDate}>
                  <Save className="h-3.5 w-3.5 mr-1" />
                  {editingEvent ? "Aktualisieren" : "Erstellen"}
                </Button>
                <Button variant="secondary" onClick={() => setShowForm(false)}>
                  Abbrechen
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
