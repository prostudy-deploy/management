"use client";

import { useAuth } from "@/context/AuthContext";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { useEffect, useState } from "react";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";
import { Project, Task, Budget, PROJECT_STATUS_LABELS, canManageTasks } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { Plus, FolderOpen, CheckCircle, ClipboardList, Wallet } from "lucide-react";

export default function ProjektePage() {
  return (
    <AuthGuard>
      <ProjekteContent />
    </AuthGuard>
  );
}

function ProjekteContent() {
  const { role } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [taskCounts, setTaskCounts] = useState<Record<string, { total: number; done: number }>>({});
  const [budgetSums, setBudgetSums] = useState<Record<string, { total: number; spent: number }>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "completed" | "archived">("all");

  useEffect(() => {
    async function load() {
      // Projekte laden
      const projSnap = await getDocs(query(collection(db, "projects"), orderBy("createdAt", "desc")));
      const loadedProjects = projSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Project));
      setProjects(loadedProjects);

      // Aufgaben zählen
      const tasksSnap = await getDocs(collection(db, "tasks"));
      const counts: Record<string, { total: number; done: number }> = {};
      tasksSnap.docs.forEach((d) => {
        const data = d.data();
        if (data.projectId) {
          if (!counts[data.projectId]) counts[data.projectId] = { total: 0, done: 0 };
          counts[data.projectId].total++;
          if (data.status === "approved") counts[data.projectId].done++;
        }
      });
      setTaskCounts(counts);

      // Budget-Summen
      const budgetsSnap = await getDocs(collection(db, "budgets"));
      const sums: Record<string, { total: number; spent: number }> = {};
      budgetsSnap.docs.forEach((d) => {
        const data = d.data();
        if (data.projectId) {
          if (!sums[data.projectId]) sums[data.projectId] = { total: 0, spent: 0 };
          sums[data.projectId].total += data.totalBudget || 0;
          sums[data.projectId].spent += data.spent || 0;
        }
      });
      setBudgetSums(sums);

      setLoading(false);
    }
    load();
  }, []);

  const filteredProjects = statusFilter === "all"
    ? projects
    : projects.filter((p) => p.status === statusFilter);

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
        <h1 className="text-2xl font-bold text-gray-900">Projekte</h1>
        {canManageTasks(role) && (
          <Link href="/projekte/neu">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Neues Projekt
            </Button>
          </Link>
        )}
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        {(["all", "active", "completed", "archived"] as const).map((s) => {
          const label = s === "all" ? "Alle" : PROJECT_STATUS_LABELS[s];
          const count = s === "all" ? projects.length : projects.filter((p) => p.status === s).length;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                statusFilter === s
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {label} ({count})
            </button>
          );
        })}
      </div>

      {filteredProjects.length === 0 ? (
        <div className="text-center py-12">
          <FolderOpen className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Noch keine Projekte erstellt.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map((project) => {
            const tc = taskCounts[project.id] || { total: 0, done: 0 };
            const bs = budgetSums[project.id] || { total: 0, spent: 0 };
            const taskProgress = tc.total > 0 ? Math.round((tc.done / tc.total) * 100) : 0;

            return (
              <Link key={project.id} href={`/projekte/${project.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                  <div className="flex items-start gap-3">
                    <div
                      className="mt-1 h-4 w-4 rounded-full shrink-0"
                      style={{ backgroundColor: project.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900 truncate">{project.name}</h3>
                        <Badge variant={project.status === "active" ? "success" : project.status === "completed" ? "info" : "default"}>
                          {PROJECT_STATUS_LABELS[project.status]}
                        </Badge>
                      </div>
                      {project.description && (
                        <p className="text-sm text-gray-500 line-clamp-2 mb-3">{project.description}</p>
                      )}

                      {/* Aufgaben-Fortschritt */}
                      {tc.total > 0 && (
                        <div className="mb-3">
                          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                            <span className="flex items-center gap-1">
                              <ClipboardList className="h-3 w-3" />
                              Aufgaben
                            </span>
                            <span>{tc.done}/{tc.total}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${taskProgress}%`, backgroundColor: project.color }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Budget-Info */}
                      {bs.total > 0 && (
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Wallet className="h-3 w-3" />
                          <span>
                            {bs.spent.toLocaleString("de-DE")} / {bs.total.toLocaleString("de-DE")} €
                          </span>
                        </div>
                      )}

                      {tc.total === 0 && bs.total === 0 && (
                        <p className="text-xs text-gray-400">Noch keine Aufgaben oder Budgets</p>
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
