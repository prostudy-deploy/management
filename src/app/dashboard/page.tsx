"use client";

import { useAuth } from "@/context/AuthContext";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { Card, CardTitle, CardContent } from "@/components/ui/Card";
import { useEffect, useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";
import { Task, canManageTasks } from "@/lib/types";
import { TaskStatusBadge } from "@/components/tasks/TaskStatusBadge";
import Link from "next/link";
import { ClipboardList, Clock, CheckCircle, AlertCircle } from "lucide-react";

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTasks() {
      if (!user) return;

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
      setLoading(false);
    }

    loadTasks();
  }, [user, role]);

  const openTasks = tasks.filter((t) => !["approved", "rejected"].includes(t.status));
  const pendingReview = tasks.filter((t) => t.status === "under_review");
  const completedTasks = tasks.filter((t) => t.status === "approved");
  const overdueTasks = tasks.filter(
    (t) => t.deadline && t.deadline.toDate() < new Date() && t.status !== "approved"
  );

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
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

      <Card>
        <CardTitle>Aktuelle Aufgaben</CardTitle>
        <CardContent>
          {openTasks.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">Keine offenen Aufgaben.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {openTasks.slice(0, 10).map((task) => (
                <Link
                  key={task.id}
                  href={`/aufgaben/${task.id}`}
                  className="flex items-center justify-between py-3 hover:bg-gray-50 px-2 rounded-lg transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{task.title}</p>
                    <p className="text-xs text-gray-500">
                      {task.deadline
                        ? `Fällig: ${task.deadline.toDate().toLocaleDateString("de-DE")}`
                        : "Kein Deadline"}
                    </p>
                  </div>
                  <TaskStatusBadge status={task.status} />
                </Link>
              ))}
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
