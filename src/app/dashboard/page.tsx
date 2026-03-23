"use client";

import { useAuth } from "@/context/AuthContext";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { Card, CardTitle, CardContent } from "@/components/ui/Card";
import { useEffect, useState } from "react";
import { collection, query, where, getDocs, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";
import { Task, ChatMessage, Expense, CalendarEvent, Project, ApprovalRequest, canManageTasks, APPROVAL_TYPE_LABELS, EXPENSE_STATUS_LABELS, AppUser } from "@/lib/types";
import { TaskStatusBadge } from "@/components/tasks/TaskStatusBadge";
import Link from "next/link";
import { ClipboardList, Clock, CheckCircle, AlertCircle, ShieldCheck, MessageSquare, CircleDot, Globe, Paperclip, ShieldQuestion, ArrowRight, Receipt, Euro, CalendarDays } from "lucide-react";

interface PendingApprovalItem {
  taskId: string;
  taskTitle: string;
  approval: ApprovalRequest;
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}

function DashboardContent() {
  const { user, role } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [recentMessages, setRecentMessages] = useState<ChatMessage[]>([]);
  const [pendingExpenses, setPendingExpenses] = useState<(Expense & { projectName?: string })[]>([]);
  const [todayEvents, setTodayEvents] = useState<CalendarEvent[]>([]);
  const [todayDeadlines, setTodayDeadlines] = useState<{ title: string; color: string; taskId: string }[]>([]);
  const [teamMembers, setTeamMembers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!user) return;

      // Aufgaben laden
      let q;
      if (canManageTasks(role)) {
        q = query(collection(db, "tasks"));
      } else {
        q = query(collection(db, "tasks"), where("assignedTo", "==", user.uid));
      }

      const snapshot = await getDocs(q);
      const loadedTasks = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Task[];
      setTasks(loadedTasks);

      // Team laden
      const usersSnap = await getDocs(query(collection(db, "users"), where("isActive", "==", true)));
      setTeamMembers(usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser)));

      // Projekte laden (für Expense-Namen und Deadline-Farben)
      const projSnap = await getDocs(collection(db, "projects"));
      const loadedProjects = projSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Project));
      const projectNames: Record<string, string> = {};
      loadedProjects.forEach((p) => { projectNames[p.id] = p.name; });

      // Offene Ausgaben laden (nur für Admin/Verwaltung)
      if (canManageTasks(role)) {
        const expSnap = await getDocs(
          query(collection(db, "expenses"), where("status", "==", "pending"), orderBy("createdAt", "desc"))
        );
        const expList = expSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Expense));
        if (expList.length > 0) {
          setPendingExpenses(expList.map((e) => ({ ...e, projectName: projectNames[e.projectId] || "Unbekannt" })));
        }
      }

      // Heutige Kalender-Events laden
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const evSnap = await getDocs(query(collection(db, "calendarEvents"), orderBy("date", "asc")));
      const allEvts = evSnap.docs.map((d) => ({ id: d.id, ...d.data() } as CalendarEvent));
      const todayEvts = allEvts.filter((e) => {
        const eDate = e.date?.toDate?.();
        if (!eDate) return false;
        return eDate >= todayStart && eDate <= todayEnd;
      });
      // Filter by permission
      const filteredEvts = canManageTasks(role)
        ? todayEvts
        : todayEvts.filter((e) => {
            const assigned = Array.isArray(e.assignedTo) ? e.assignedTo : [e.assignedTo];
            return assigned.includes(user.uid) || e.createdBy === user.uid;
          });
      setTodayEvents(filteredEvts);

      // Heutige Deadlines aus Tasks
      const todayDl = loadedTasks
        .filter((t) => {
          if (!t.deadline || t.status === "approved") return false;
          const dl = t.deadline.toDate();
          return dl >= todayStart && dl <= todayEnd;
        })
        .map((t) => {
          const proj = t.projectId ? loadedProjects.find((p: any) => p.id === t.projectId) : null;
          return { title: t.title, color: proj?.color || "#EF4444", taskId: t.id };
        });
      setTodayDeadlines(todayDl);

      setLoading(false);
    }

    loadData();
  }, [user, role]);

  // Letzte Chat-Nachrichten (Echtzeit)
  useEffect(() => {
    const q = query(
      collection(db, "chatMessages"),
      orderBy("createdAt", "desc"),
      limit(10)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as ChatMessage[];
      setRecentMessages(msgs);
    });

    return () => unsub();
  }, []);

  const openTasks = tasks.filter((t) => !["approved", "rejected"].includes(t.status));
  const pendingReview = tasks.filter((t) => t.status === "under_review");
  const completedTasks = tasks.filter((t) => t.status === "approved");
  const overdueTasks = tasks.filter(
    (t) => t.deadline && t.deadline.toDate() < new Date() && t.status !== "approved"
  );

  // Offene Freigaben sammeln (aus allen Tasks)
  const pendingApprovals: PendingApprovalItem[] = [];
  tasks.forEach((task) => {
    (task.approvals || []).forEach((approval) => {
      if (approval.status === "pending") {
        pendingApprovals.push({ taskId: task.id, taskTitle: task.title, approval });
      }
    });
  });
  // Neueste zuerst, maximal 10
  pendingApprovals.sort((a, b) => b.approval.createdAt - a.approval.createdAt);
  const displayApprovals = pendingApprovals.slice(0, 10);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 mb-8">
        <StatCard
          title="Offene Aufgaben"
          value={openTasks.length}
          icon={<ClipboardList className="h-5 w-5 text-blue-600" />}
        />
        <StatCard
          title="Warten auf Review"
          value={pendingReview.length}
          icon={<Clock className="h-5 w-5 text-yellow-600" />}
        />
        <StatCard
          title="Abgeschlossen"
          value={completedTasks.length}
          icon={<CheckCircle className="h-5 w-5 text-green-600" />}
        />
        <StatCard
          title="Überfällig"
          value={overdueTasks.length}
          icon={<AlertCircle className="h-5 w-5 text-red-600" />}
        />
      </div>

      {/* Heutige Termine & Deadlines */}
      <Card className="mb-6">
        <CardTitle>
          <span className="flex items-center justify-between w-full">
            <span className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-blue-600" />
              Heute
              {(todayEvents.length > 0 || todayDeadlines.length > 0) && (
                <span className="text-xs font-normal text-gray-400">
                  {todayEvents.length + todayDeadlines.length} Termin{todayEvents.length + todayDeadlines.length !== 1 ? "e" : ""}
                </span>
              )}
            </span>
            <Link href="/kalender" className="text-xs text-blue-600 hover:underline font-normal">
              Kalender
            </Link>
          </span>
        </CardTitle>
        <CardContent>
          {todayEvents.length === 0 && todayDeadlines.length === 0 ? (
            <p className="text-sm text-gray-500 py-3 text-center">Heute keine Termine oder Deadlines.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {/* Deadlines */}
              {todayDeadlines.map((dl) => (
                <Link
                  key={dl.taskId}
                  href={`/aufgaben/${dl.taskId}`}
                  className="flex items-center gap-3 py-2.5 px-2 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <span className="shrink-0 rounded-full h-2.5 w-2.5 ring-2 ring-red-200" style={{ backgroundColor: dl.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-red-700 truncate">Deadline: {dl.title}</p>
                  </div>
                  <span className="text-xs text-red-500 font-medium shrink-0">Fällig heute</span>
                </Link>
              ))}
              {/* Events */}
              {todayEvents.map((ev) => {
                const evDate = ev.date?.toDate?.();
                const evEnd = ev.endDate?.toDate?.();
                return (
                  <Link
                    key={ev.id}
                    href="/kalender"
                    className="flex items-center gap-3 py-2.5 px-2 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <span className="shrink-0 rounded-full h-2.5 w-2.5" style={{ backgroundColor: ev.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{ev.title}</p>
                    </div>
                    {ev.allDay ? (
                      <span className="text-xs text-gray-400 shrink-0">Ganztägig</span>
                    ) : evDate ? (
                      <span className="text-xs text-gray-500 shrink-0 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {evDate.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                        {evEnd && ` – ${evEnd.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Zwei-Spalten-Layout für Freigaben und Chat */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6">
        {/* Offene Freigaben */}
        {canManageTasks(role) && (
          <Card>
            <CardTitle>
              <span className="flex items-center justify-between w-full">
                <span className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-orange-600" />
                  Offene Freigaben
                  {pendingApprovals.length > 0 && (
                    <span className="flex items-center gap-1 rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-xs font-medium">
                      {pendingApprovals.length}
                    </span>
                  )}
                </span>
              </span>
            </CardTitle>
            <CardContent>
              {displayApprovals.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">Keine offenen Freigaben.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {displayApprovals.map(({ taskId, taskTitle, approval }) => {
                    const creatorName = teamMembers.find((m) => m.uid === approval.createdBy)?.displayName || "Unbekannt";
                    const createdDate = new Date(approval.createdAt);
                    const typeIcon = approval.type === "file"
                      ? <Paperclip className="h-3.5 w-3.5" />
                      : approval.type === "question"
                      ? <ShieldQuestion className="h-3.5 w-3.5" />
                      : approval.type === "link"
                      ? <Globe className="h-3.5 w-3.5" />
                      : <ShieldCheck className="h-3.5 w-3.5" />;

                    return (
                      <Link
                        key={approval.id}
                        href={`/aufgaben/${taskId}`}
                        className="flex items-start gap-3 py-3 px-2 hover:bg-gray-50 rounded-lg transition-colors"
                      >
                        <span className="shrink-0 rounded-full p-1.5 bg-orange-100 text-orange-700 mt-0.5">
                          {typeIcon}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{approval.title}</p>
                          <p className="text-xs text-gray-500 truncate">
                            {taskTitle} · {creatorName}
                          </p>
                          <p className="text-xs text-gray-400">
                            {createdDate.toLocaleDateString("de-DE")} {createdDate.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                            {" · "}{APPROVAL_TYPE_LABELS[approval.type]}
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-gray-400 shrink-0 mt-1" />
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Letzte Chat-Nachrichten */}
        <Card>
          <CardTitle>
            <span className="flex items-center justify-between w-full">
              <span className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-blue-600" />
                Letzte Nachrichten
              </span>
              <Link href="/chat" className="text-xs text-blue-600 hover:underline font-normal">
                Alle anzeigen
              </Link>
            </span>
          </CardTitle>
          <CardContent>
            {recentMessages.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">Keine Nachrichten.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {recentMessages.map((msg) => {
                  const msgDate = msg.createdAt?.toDate?.();
                  return (
                    <Link
                      key={msg.id}
                      href={`/chat?group=${msg.groupId}`}
                      className="flex items-start gap-3 py-3 px-2 hover:bg-gray-50 rounded-lg transition-colors"
                    >
                      <div className="shrink-0 h-8 w-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold mt-0.5">
                        {msg.displayName?.charAt(0)?.toUpperCase() || "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900">{msg.displayName}</p>
                          {msgDate && (
                            <p className="text-xs text-gray-400">
                              {msgDate.toLocaleDateString("de-DE")} {msgDate.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 truncate">
                          {msg.content || (msg.attachments?.length ? `📎 ${msg.attachments.length} Datei(en)` : "")}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Offene Ausgaben */}
        {canManageTasks(role) && pendingExpenses.length > 0 && (
          <Card>
            <CardTitle>
              <span className="flex items-center justify-between w-full">
                <span className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-purple-600" />
                  Offene Ausgaben
                  <span className="flex items-center gap-1 rounded-full bg-purple-100 text-purple-700 px-2 py-0.5 text-xs font-medium">
                    {pendingExpenses.length}
                  </span>
                </span>
              </span>
            </CardTitle>
            <CardContent>
              <div className="divide-y divide-gray-100">
                {pendingExpenses.slice(0, 10).map((expense) => {
                  const creatorName = teamMembers.find((m) => m.uid === expense.createdBy)?.displayName || "Unbekannt";
                  const expDate = expense.createdAt?.toDate?.();

                  return (
                    <Link
                      key={expense.id}
                      href={`/projekte/${expense.projectId}`}
                      className="flex items-start gap-3 py-3 px-2 hover:bg-gray-50 rounded-lg transition-colors"
                    >
                      <span className="shrink-0 rounded-full p-1.5 bg-purple-100 text-purple-700 mt-0.5">
                        <Euro className="h-3.5 w-3.5" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{expense.title}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {expense.projectName} · {creatorName}
                        </p>
                        <p className="text-xs text-gray-400">
                          {expense.amount.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
                          {expDate && ` · ${expDate.toLocaleDateString("de-DE")}`}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-gray-400 shrink-0 mt-1" />
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardTitle>Aktuelle Aufgaben</CardTitle>
        <CardContent>
          {openTasks.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">Keine offenen Aufgaben.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {openTasks.slice(0, 10).map((task) => {
                const taskPendingApprovals = (task.approvals || []).filter((a) => a.status === "pending").length;
                return (
                  <Link
                    key={task.id}
                    href={`/aufgaben/${task.id}`}
                    className="flex items-center justify-between py-3 hover:bg-gray-50 px-2 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{task.title}</p>
                        <p className="text-xs text-gray-500">
                          {task.deadline
                            ? `Fällig: ${task.deadline.toDate().toLocaleDateString("de-DE")}`
                            : "Kein Deadline"}
                        </p>
                      </div>
                      {taskPendingApprovals > 0 && (
                        <span className="flex items-center gap-1 rounded-full bg-orange-100 text-orange-700 px-1.5 py-0.5 text-xs font-medium">
                          <CircleDot className="h-3 w-3" />
                          {taskPendingApprovals}
                        </span>
                      )}
                    </div>
                    <TaskStatusBadge status={task.status} />
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        {icon}
      </div>
    </Card>
  );
}
