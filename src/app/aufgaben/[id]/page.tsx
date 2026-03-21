"use client";

import { useAuth } from "@/context/AuthContext";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { useEffect, useState } from "react";
import { doc, getDoc, updateDoc, Timestamp, collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";
import { Task, Submission, Review, AppUser, Project, TaskPriority, TaskCategory, TaskStatus, PRIORITY_LABELS, CATEGORY_LABELS, LINK_TYPE_LABELS, canManageTasks } from "@/lib/types";
import { TaskStatusBadge } from "@/components/tasks/TaskStatusBadge";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Card, CardTitle, CardContent } from "@/components/ui/Card";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { FileList } from "@/components/ui/FileUpload";
import { ArrowLeft, ExternalLink, Video, Palette, FileText, Link2, Star, AlertTriangle, CheckCircle, Paperclip, Pencil, X, Save, Clock } from "lucide-react";

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

  // Edit Mode
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriority, setEditPriority] = useState<TaskPriority>("medium");
  const [editCategory, setEditCategory] = useState<TaskCategory>("marketing");
  const [editStatus, setEditStatus] = useState<TaskStatus>("created");
  const [editDeadline, setEditDeadline] = useState("");
  const [editAssignedTo, setEditAssignedTo] = useState("");

  // Team Members für Dropdown
  const [teamMembers, setTeamMembers] = useState<AppUser[]>([]);

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

      // Team laden für Zuweisungs-Dropdown
      const usersSnap = await getDocs(query(collection(db, "users"), where("isActive", "==", true)));
      setTeamMembers(usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser)));

      setLoading(false);
    }
    load();
  }, [taskId]);

  const startEditing = () => {
    if (!task) return;
    setEditTitle(task.title);
    setEditDescription(task.description);
    setEditPriority(task.priority);
    setEditCategory(task.category);
    setEditStatus(task.status);
    setEditAssignedTo(task.assignedTo || "");
    setEditDeadline(task.deadline ? task.deadline.toDate().toISOString().split("T")[0] : "");
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
  };

  const saveEditing = async () => {
    if (!task || !user) return;
    setSaving(true);

    try {
      const now = Timestamp.now();
      const updates: Record<string, any> = {
        title: editTitle,
        description: editDescription,
        priority: editPriority,
        category: editCategory,
        status: editStatus,
        assignedTo: editAssignedTo || null,
        deadline: editDeadline ? Timestamp.fromDate(new Date(editDeadline)) : null,
        updatedAt: now,
        lastEditedBy: user.uid,
      };

      await updateDoc(doc(db, "tasks", taskId), updates);

      setTask({
        ...task,
        ...updates,
        updatedAt: now,
      } as Task);

      setEditing(false);
      toast.success("Aufgabe aktualisiert!");
    } catch (err) {
      console.error(err);
      toast.error("Fehler beim Speichern.");
    } finally {
      setSaving(false);
    }
  };

  const handleStartTask = async () => {
    if (!task) return;
    const now = Timestamp.now();
    await updateDoc(doc(db, "tasks", taskId), {
      status: "in_progress",
      updatedAt: now,
    });
    setTask({ ...task, status: "in_progress", updatedAt: now });
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
  const canEdit = canManageTasks(role);

  // Zuletzt bearbeitet
  const updatedDate = task.updatedAt?.toDate();
  const createdDate = task.createdAt?.toDate();
  const wasEdited = updatedDate && createdDate && updatedDate.getTime() - createdDate.getTime() > 60000;

  return (
    <div>
      <Link href="/aufgaben" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="h-4 w-4" />
        Zurück
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          {editing ? (
            <Input
              id="editTitle"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="text-xl font-bold"
            />
          ) : (
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{task.title}</h1>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <TaskStatusBadge status={task.status} />
            <Badge variant="default">{PRIORITY_LABELS[task.priority]}</Badge>
            <Badge variant="info">{CATEGORY_LABELS[task.category]}</Badge>
          </div>
          {/* Zuletzt bearbeitet */}
          {wasEdited && (
            <p className="mt-2 flex items-center gap-1 text-xs text-gray-400">
              <Clock className="h-3 w-3" />
              Zuletzt bearbeitet am {updatedDate.toLocaleDateString("de-DE")} um {updatedDate.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && !editing && (
            <Button variant="secondary" onClick={startEditing}>
              <Pencil className="h-4 w-4 mr-1" />
              Bearbeiten
            </Button>
          )}
          {editing && (
            <>
              <Button onClick={saveEditing} disabled={saving}>
                <Save className="h-4 w-4 mr-1" />
                {saving ? "Speichern..." : "Speichern"}
              </Button>
              <Button variant="secondary" onClick={cancelEditing}>
                <X className="h-4 w-4 mr-1" />
                Abbrechen
              </Button>
            </>
          )}
          {!editing && isAssignee && task.status === "assigned" && (
            <Button onClick={handleStartTask}>Aufgabe starten</Button>
          )}
          {!editing && canSubmit && (
            <Link href={`/aufgaben/${taskId}/abgabe`}>
              <Button>Abgabe einreichen</Button>
            </Link>
          )}
          {!editing && canReview && (
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
              {editing ? (
                <Textarea
                  id="editDescription"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={6}
                />
              ) : (
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.description}</p>
              )}
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
                      {sub.attachments && sub.attachments.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-medium text-gray-500 mb-1">Anhänge:</p>
                          <FileList attachments={sub.attachments} />
                        </div>
                      )}

                      <p className="mt-2 text-xs text-gray-400">
                        Eingereicht: {sub.submittedAt?.toDate().toLocaleDateString("de-DE")}
                      </p>

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
              {editing ? (
                <div className="space-y-3">
                  <Select
                    id="editStatus"
                    label="Status"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as TaskStatus)}
                    options={[
                      { value: "created", label: "Erstellt" },
                      { value: "assigned", label: "Zugewiesen" },
                      { value: "in_progress", label: "In Bearbeitung" },
                      { value: "submitted", label: "Eingereicht" },
                      { value: "under_review", label: "Wird geprüft" },
                      { value: "approved", label: "Freigegeben" },
                      { value: "rejected", label: "Abgelehnt" },
                    ]}
                  />
                  <Select
                    id="editPriority"
                    label="Priorität"
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value as TaskPriority)}
                    options={[
                      { value: "low", label: "Niedrig" },
                      { value: "medium", label: "Mittel" },
                      { value: "high", label: "Hoch" },
                    ]}
                  />
                  <Select
                    id="editCategory"
                    label="Kategorie"
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value as TaskCategory)}
                    options={[
                      { value: "marketing", label: "Marketing" },
                      { value: "verwaltung", label: "Verwaltung" },
                      { value: "sonstiges", label: "Sonstiges" },
                    ]}
                  />
                  <Select
                    id="editAssignedTo"
                    label="Zugewiesen an"
                    value={editAssignedTo}
                    onChange={(e) => setEditAssignedTo(e.target.value)}
                    options={[
                      { value: "", label: "Nicht zugewiesen" },
                      ...teamMembers.map((m) => ({
                        value: m.uid,
                        label: `${m.displayName} (${m.role})`,
                      })),
                    ]}
                  />
                  <Input
                    id="editDeadline"
                    label="Deadline"
                    type="date"
                    value={editDeadline}
                    onChange={(e) => setEditDeadline(e.target.value)}
                  />
                </div>
              ) : (
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-gray-500">Zugewiesen an</dt>
                    <dd className="font-medium">
                      {task.assignedTo
                        ? teamMembers.find((m) => m.uid === task.assignedTo)?.displayName || task.assignedTo
                        : "Nicht zugewiesen"}
                    </dd>
                  </div>
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
                  {wasEdited && (
                    <div>
                      <dt className="text-gray-500">Zuletzt bearbeitet</dt>
                      <dd className="font-medium text-xs">
                        {updatedDate.toLocaleDateString("de-DE")}, {updatedDate.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                      </dd>
                    </div>
                  )}
                </dl>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
