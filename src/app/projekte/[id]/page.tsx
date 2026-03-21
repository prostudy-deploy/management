"use client";

import { useAuth } from "@/context/AuthContext";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { useEffect, useState } from "react";
import { doc, getDoc, updateDoc, Timestamp, collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";
import { Project, Task, Budget, PROJECT_STATUS_LABELS, ProjectStatus, STATUS_LABELS, PRIORITY_LABELS, canManageTasks } from "@/lib/types";
import { TaskStatusBadge } from "@/components/tasks/TaskStatusBadge";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle, CardContent } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Plus, ClipboardList, Wallet, Calendar, Settings } from "lucide-react";

export default function ProjektDetailPage() {
  return (
    <AuthGuard>
      <ProjektDetailContent />
    </AuthGuard>
  );
}

function ProjektDetailContent() {
  const { user, role } = useAuth();
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    async function load() {
      // Projekt laden
      const projDoc = await getDoc(doc(db, "projects", projectId));
      if (projDoc.exists()) {
        setProject({ id: projDoc.id, ...projDoc.data() } as Project);
      }

      // Aufgaben des Projekts
      const tasksSnap = await getDocs(
        query(collection(db, "tasks"), where("projectId", "==", projectId), orderBy("createdAt", "desc"))
      );
      setTasks(tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Task)));

      // Budgets des Projekts
      const budgetsSnap = await getDocs(
        query(collection(db, "budgets"), where("projectId", "==", projectId), orderBy("createdAt", "desc"))
      );
      setBudgets(budgetsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Budget)));

      setLoading(false);
    }
    load();
  }, [projectId]);

  const handleStatusChange = async (newStatus: ProjectStatus) => {
    if (!project) return;
    try {
      await updateDoc(doc(db, "projects", projectId), {
        status: newStatus,
        updatedAt: Timestamp.now(),
      });
      setProject({ ...project, status: newStatus });
      toast.success("Projektstatus aktualisiert!");
    } catch (err) {
      toast.error("Fehler beim Aktualisieren.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!project) {
    return <p className="text-gray-500">Projekt nicht gefunden.</p>;
  }

  const completedTasks = tasks.filter((t) => t.status === "approved").length;
  const taskProgress = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;
  const totalBudget = budgets.reduce((s, b) => s + b.totalBudget, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
  const budgetPercent = totalBudget > 0 ? Math.min((totalSpent / totalBudget) * 100, 100) : 0;

  return (
    <div>
      <Link href="/projekte" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="h-4 w-4" />
        Zurück
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 rounded-full" style={{ backgroundColor: project.color }} />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
            {project.description && (
              <p className="text-sm text-gray-500 mt-1">{project.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={project.status === "active" ? "success" : project.status === "completed" ? "info" : "default"}>
            {PROJECT_STATUS_LABELS[project.status]}
          </Badge>
          {canManageTasks(role) && (
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <Settings className="h-4 w-4 text-gray-500" />
            </button>
          )}
        </div>
      </div>

      {/* Status ändern */}
      {showSettings && canManageTasks(role) && (
        <Card className="mb-6">
          <CardTitle>Projektstatus ändern</CardTitle>
          <CardContent>
            <div className="flex gap-2">
              {(["active", "completed", "archived"] as ProjectStatus[]).map((s) => (
                <Button
                  key={s}
                  variant={project.status === s ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => handleStatusChange(s)}
                >
                  {PROJECT_STATUS_LABELS[s]}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Aufgaben</p>
              <p className="text-2xl font-bold text-gray-900">{completedTasks}/{tasks.length}</p>
            </div>
            <ClipboardList className="h-5 w-5 text-blue-600" />
          </div>
          {tasks.length > 0 && (
            <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${taskProgress}%`, backgroundColor: project.color }}
              />
            </div>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Gesamtbudget</p>
              <p className="text-2xl font-bold text-gray-900">{totalBudget.toLocaleString("de-DE")} €</p>
            </div>
            <Wallet className="h-5 w-5 text-green-600" />
          </div>
          {totalBudget > 0 && (
            <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  budgetPercent > 90 ? "bg-red-500" : budgetPercent > 70 ? "bg-yellow-500" : "bg-green-500"
                }`}
                style={{ width: `${budgetPercent}%` }}
              />
            </div>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Ausgegeben</p>
              <p className="text-2xl font-bold text-gray-900">{totalSpent.toLocaleString("de-DE")} €</p>
            </div>
            <div className="text-sm text-gray-500">
              {totalBudget > 0 && (
                <span className={totalSpent > totalBudget ? "text-red-600 font-medium" : "text-green-600"}>
                  {Math.round(budgetPercent)}%
                </span>
              )}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Aufgaben */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Aufgaben</h2>
            {canManageTasks(role) && (
              <Link href={`/aufgaben/neu?projektId=${projectId}`}>
                <Button size="sm">
                  <Plus className="h-3 w-3 mr-1" />
                  Aufgabe
                </Button>
              </Link>
            )}
          </div>

          {tasks.length === 0 ? (
            <Card>
              <p className="text-sm text-gray-500 text-center py-4">Noch keine Aufgaben in diesem Projekt.</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {tasks.map((task) => (
                <Link key={task.id} href={`/aufgaben/${task.id}`}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer py-3 px-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-gray-900 truncate">{task.title}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <TaskStatusBadge status={task.status} />
                          <Badge variant="default">{PRIORITY_LABELS[task.priority]}</Badge>
                          {task.deadline && (
                            <span className="flex items-center gap-1 text-xs text-gray-500">
                              <Calendar className="h-3 w-3" />
                              {task.deadline.toDate().toLocaleDateString("de-DE")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Budgets */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Budgets</h2>
            {canManageTasks(role) && (
              <Link href={`/budget/neu?projektId=${projectId}`}>
                <Button size="sm">
                  <Plus className="h-3 w-3 mr-1" />
                  Budget
                </Button>
              </Link>
            )}
          </div>

          {budgets.length === 0 ? (
            <Card>
              <p className="text-sm text-gray-500 text-center py-4">Noch keine Budgets in diesem Projekt.</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {budgets.map((budget) => {
                const pct = budget.totalBudget > 0
                  ? Math.min((budget.spent / budget.totalBudget) * 100, 100)
                  : 0;
                const remaining = budget.totalBudget - budget.spent;
                const isOver = remaining < 0;

                return (
                  <Card key={budget.id} className="py-3 px-4">
                    <h4 className="text-sm font-medium text-gray-900">{budget.title}</h4>
                    <p className="text-xs text-gray-500">{budget.category} · {budget.period}</p>
                    <div className="mt-2">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-500">
                          {budget.spent.toLocaleString("de-DE")} / {budget.totalBudget.toLocaleString("de-DE")} €
                        </span>
                        <span className={isOver ? "text-red-600" : "text-green-600"}>
                          {isOver ? "-" : ""}{Math.abs(remaining).toLocaleString("de-DE")} €
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            isOver ? "bg-red-500" : pct > 80 ? "bg-yellow-500" : "bg-green-500"
                          }`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
