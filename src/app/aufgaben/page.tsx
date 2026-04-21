"use client";

import { useAuth } from "@/context/AuthContext";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { useEffect, useState } from "react";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";
import { Task, TaskStatus, STATUS_LABELS, PRIORITY_LABELS, CATEGORY_LABELS, Project, canManageTasks } from "@/lib/types";
import { TaskStatusBadge } from "@/components/tasks/TaskStatusBadge";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { Select } from "@/components/ui/Select";
import { Plus, Calendar, FolderOpen, CircleDot } from "lucide-react";

export default function AufgabenPage() {
  return (
    <AuthGuard>
      <AufgabenContent />
    </AuthGuard>
  );
}

function AufgabenContent() {
  const { user, role } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Record<string, Project>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");

  useEffect(() => {
    async function loadTasks() {
      if (!user) return;

      try {
        let q;
        if (canManageTasks(role)) {
          q = query(collection(db, "tasks"), orderBy("createdAt", "desc"));
        } else {
          // Kein orderBy hier → kein Composite Index nötig; Sortierung im JS
          q = query(
            collection(db, "tasks"),
            where("assignedTo", "==", user.uid)
          );
        }

        const snapshot = await getDocs(q);
        const loadedTasks = (snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Task[]).sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() ?? 0;
          const bTime = b.createdAt?.toMillis?.() ?? 0;
          return bTime - aTime;
        });

        setTasks(loadedTasks);

        // Projekte laden
        const projSnap = await getDocs(collection(db, "projects"));
        const projMap: Record<string, Project> = {};
        projSnap.docs.forEach((d) => {
          projMap[d.id] = { id: d.id, ...d.data() } as Project;
        });
        setProjects(projMap);
      } catch (err) {
        console.error("Fehler beim Laden der Aufgaben:", err);
      } finally {
        setLoading(false);
      }
    }

    loadTasks();
  }, [user, role]);

  const filteredTasks = tasks.filter((t) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (projectFilter !== "all") {
      if (projectFilter === "none") return !t.projectId;
      return t.projectId === projectFilter;
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Aufgaben</h1>
        {canManageTasks(role) && (
          <Link href="/aufgaben/neu">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Neue Aufgabe
            </Button>
          </Link>
        )}
      </div>

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <button
          onClick={() => setStatusFilter("all")}
          className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
            statusFilter === "all"
              ? "bg-blue-100 text-blue-700"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Alle ({tasks.length})
        </button>
        {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((status) => {
          const count = tasks.filter((t) => t.status === status).length;
          if (count === 0) return null;
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                statusFilter === status
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {STATUS_LABELS[status]} ({count})
            </button>
          );
        })}

        {/* Projekt-Filter */}
        {Object.keys(projects).length > 0 && (
          <div className="ml-auto w-48">
            <Select
              id="projectFilter"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              options={[
                { value: "all", label: "Alle Projekte" },
                { value: "none", label: "Ohne Projekt" },
                ...Object.values(projects).map((p) => ({
                  value: p.id,
                  label: p.name,
                })),
              ]}
            />
          </div>
        )}
      </div>

      {/* Task List */}
      {filteredTasks.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Keine Aufgaben gefunden.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTasks.map((task) => (
            <Link
              key={task.id}
              href={`/aufgaben/${task.id}`}
              className="block rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900">{task.title}</h3>
                  <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                    {task.description}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <TaskStatusBadge status={task.status} />
                    <Badge variant="default">{PRIORITY_LABELS[task.priority]}</Badge>
                    <Badge variant="info">{CATEGORY_LABELS[task.category]}</Badge>
                    {task.projectId && projects[task.projectId] && (
                      <span className="flex items-center gap-1 text-xs text-gray-600">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: projects[task.projectId].color }}
                        />
                        {projects[task.projectId].name}
                      </span>
                    )}
                    {task.approvals && task.approvals.filter((a: any) => a.status === "pending").length > 0 && (
                      <span className="flex items-center gap-1 rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-xs font-medium">
                        <CircleDot className="h-3 w-3" />
                        {task.approvals.filter((a: any) => a.status === "pending").length} Freigabe{task.approvals.filter((a: any) => a.status === "pending").length > 1 ? "n" : ""}
                      </span>
                    )}
                    {task.deadline && (
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <Calendar className="h-3 w-3" />
                        {task.deadline.toDate().toLocaleDateString("de-DE")}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
