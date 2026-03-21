"use client";

import { useAuth } from "@/context/AuthContext";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { useEffect, useState } from "react";
import { doc, getDoc, updateDoc, Timestamp, collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";
import { Task, Submission, Review, PRIORITY_LABELS, CATEGORY_LABELS, LINK_TYPE_LABELS, canManageTasks } from "@/lib/types";
import { TaskStatusBadge } from "@/components/tasks/TaskStatusBadge";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle, CardContent } from "@/components/ui/Card";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { FileList } from "@/components/ui/FileUpload";
import { ArrowLeft, ExternalLink, Video, Palette, FileText, Link2, Star, AlertTriangle, CheckCircle, Paperclip } from "lucide-react";

const linkIcons: Record<string, React.ReactNode> = {
  meeting: <Video className="h-4 w-4" />,
  canva: <Palette className="h-4 w-4" />,
  document: <FileText className="h-4 w-4" />,
  other: <Link2 className="h-4 w-4" />,
};

export default function AufgabeDetailPage() {
  return (
    <AuthGuard>
      <AufgabeDetailContent />
    </AuthGuard>
  );
}

function AufgabeDetailContent() {
  const { user, role } = useAuth();
  const params = useParams();
  const taskId = params.id as string;

  const [task, setTask] = useState<Task | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const taskDoc = await getDoc(doc(db, "tasks", taskId));
      if (taskDoc.exists()) {
        setTask({ id: taskDoc.id, ...taskDoc.data() } as Task);
      }

      const subQuery = query(
        collection(db, "submissions"),
        where("taskId", "==", taskId),
        orderBy("submittedAt", "desc")
      );
      const subSnapshot = await getDocs(subQuery);
      setSubmissions(
        subSnapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Submission))
      );

      const revQuery = query(
        collection(db, "reviews"),
        where("taskId", "==", taskId),
        orderBy("reviewedAt", "desc")
      );
      const revSnapshot = await getDocs(revQuery);
      setReviews(
        revSnapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Review))
      );

      setLoading(false);
    }
    load();
  }, [taskId]);

  const handleStartTask = async () => {
    if (!task) return;
    await updateDoc(doc(db, "tasks", taskId), {
      status: "in_progress",
      updatedAt: Timestamp.now(),
    });
    setTask({ ...task, status: "in_progress" });
    toast.success("Aufgabe gestartet!");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!task) {
    return <p className="text-gray-500">Aufgabe nicht gefunden.</p>;
  }

  const isAssignee = task.assignedTo === user?.uid;
  const canSubmit = isAssignee && ["assigned", "in_progress", "rejected"].includes(task.status);
  const canReview = canManageTasks(role) && task.status === "under_review";

  return (
    <div>
      <Link href="/aufgaben" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="h-4 w-4" />
        Zurück
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{task.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <TaskStatusBadge status={task.status} />
            <Badge variant="default">{PRIORITY_LABELS[task.priority]}</Badge>
            <Badge variant="info">{CATEGORY_LABELS[task.category]}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAssignee && task.status === "assigned" && (
            <Button onClick={handleStartTask}>Aufgabe starten</Button>
          )}
          {canSubmit && (
            <Link href={`/aufgaben/${taskId}/abgabe`}>
              <Button>Abgabe einreichen</Button>
            </Link>
          )}
          {canReview && (
            <Link href={`/aufgaben/${taskId}/bewertung`}>
              <Button>Bewerten</Button>
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardTitle>Beschreibung</CardTitle>
            <CardContent>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.description}</p>
            </CardContent>
          </Card>

          {/* Anhänge */}
          {task.attachments && task.attachments.length > 0 && (
            <Card>
              <CardTitle>
                <span className="flex items-center gap-2">
                  <Paperclip className="h-4 w-4" />
                  Anhänge ({task.attachments.length})
                </span>
              </CardTitle>
              <CardContent>
                <FileList attachments={task.attachments} />
              </CardContent>
            </Card>
          )}

          {/* Links */}
          {task.links && task.links.length > 0 && (
            <Card>
              <CardTitle>Links & Ressourcen</CardTitle>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {task.links.map((link, i) => (
                    <a
                      key={i}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm hover:bg-gray-100 transition-colors"
                    >
                      {linkIcons[link.type] || <Link2 className="h-4 w-4" />}
                      <span className="text-xs font-medium text-gray-500 uppercase">{LINK_TYPE_LABELS[link.type]}</span>
                      <span className="text-gray-900">{link.label}</span>
                      <ExternalLink className="h-3 w-3 text-gray-400" />
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Submissions */}
          {submissions.length > 0 && (
            <Card>
              <CardTitle>Abgaben</CardTitle>
              <CardContent>
                <div className="space-y-4">
                  {submissions.map((sub) => (
                    <div key={sub.id} className="rounded-lg border border-gray-100 p-4">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{sub.content}</p>
                      {/* Abgabe-Anhänge */}
                      {sub.attachments && sub.attachments.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-medium text-gray-500 mb-1">Anhänge:</p>
                          <FileList attachments={sub.attachments} />
                        </div>
                      )}

                      <p className="mt-2 text-xs text-gray-400">
                        Eingereicht: {sub.submittedAt?.toDate().toLocaleDateString("de-DE")}
                      </p>

                      {/* AI Feedback */}
                      {sub.aiFeedback && (
                        <div className="mt-3 rounded-lg bg-blue-50 p-3">
                          <p className="text-xs font-semibold text-blue-700 mb-2">KI-Feedback</p>
                          <p className="text-sm text-gray-700 mb-2">{sub.aiFeedback.summary}</p>
                          {sub.aiFeedback.score !== null && (
                            <div className="flex items-center gap-1 mb-2">
                              <Star className="h-4 w-4 text-yellow-500" />
                              <span className="text-sm font-medium">{sub.aiFeedback.score}/10</span>
                            </div>
                          )}
                          {sub.aiFeedback.strengths.length > 0 && (
                            <div className="mb-1">
                              <p className="text-xs font-medium text-green-700">Stärken:</p>
                              <ul className="list-disc list-inside text-xs text-gray-600">
                                {sub.aiFeedback.strengths.map((s, i) => <li key={i}>{s}</li>)}
                              </ul>
                            </div>
                          )}
                          {sub.aiFeedback.improvements.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-orange-700">Verbesserungen:</p>
                              <ul className="list-disc list-inside text-xs text-gray-600">
                                {sub.aiFeedback.improvements.map((s, i) => <li key={i}>{s}</li>)}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                      {sub.aiStatus === "pending" && (
                        <p className="mt-2 text-xs text-blue-500">KI-Feedback wird generiert...</p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Reviews */}
          {reviews.length > 0 && (
            <Card>
              <CardTitle>Bewertungen</CardTitle>
              <CardContent>
                <div className="space-y-3">
                  {reviews.map((rev) => (
                    <div key={rev.id} className="rounded-lg border border-gray-100 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        {rev.decision === "approved" ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-red-600" />
                        )}
                        <span className="text-sm font-medium capitalize">
                          {rev.decision === "approved" ? "Freigegeben" : rev.decision === "rejected" ? "Abgelehnt" : "Überarbeitung nötig"}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700">{rev.feedback}</p>
                      <p className="mt-2 text-xs text-gray-400">
                        {rev.reviewedAt?.toDate().toLocaleDateString("de-DE")}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar Info */}
        <div className="space-y-4">
          <Card>
            <CardTitle>Details</CardTitle>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-gray-500">Deadline</dt>
                  <dd className="font-medium">
                    {task.deadline
                      ? task.deadline.toDate().toLocaleDateString("de-DE")
                      : "Keine"}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Erstellt</dt>
                  <dd className="font-medium">
                    {task.createdAt?.toDate().toLocaleDateString("de-DE")}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
