"use client";

import { useAuth } from "@/context/AuthContext";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { useEffect, useState } from "react";
import { doc, getDoc, updateDoc, Timestamp, collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";
import { Task, Submission, Review, AppUser, ChecklistItem, TaskAttachment, ApprovalRequest, ApprovalType, ApprovalStatus, APPROVAL_TYPE_LABELS, APPROVAL_STATUS_LABELS, TaskPriority, TaskCategory, TaskStatus, PRIORITY_LABELS, CATEGORY_LABELS, LINK_TYPE_LABELS, canManageTasks } from "@/lib/types";
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
import { FileList, FileUpload } from "@/components/ui/FileUpload";
import { ArrowLeft, ExternalLink, Video, Palette, FileText, Link2, Star, AlertTriangle, CheckCircle, Paperclip, Pencil, X, Save, Clock, Plus, Square, CheckSquare, Trash2, Upload, ShieldCheck, ShieldQuestion, MessageSquare, Send, ChevronDown, ChevronUp, CircleDot, Globe } from "lucide-react";

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

  // Checklist
  const [newCheckItem, setNewCheckItem] = useState("");

  // Freigaben
  const [showApprovalForm, setShowApprovalForm] = useState(false);
  const [approvalType, setApprovalType] = useState<ApprovalType>("general");
  const [approvalTitle, setApprovalTitle] = useState("");
  const [approvalDescription, setApprovalDescription] = useState("");
  const [approvalAttachments, setApprovalAttachments] = useState<TaskAttachment[]>([]);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [responseNote, setResponseNote] = useState("");
  const [approvalLink, setApprovalLink] = useState("");
  const [expandedApprovals, setExpandedApprovals] = useState<Set<string>>(new Set());

  // (File Upload wird direkt über task.attachments gehandhabt)

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

  // --- Checkliste ---
  const addCheckItem = async () => {
    if (!newCheckItem.trim() || !task || !user) return;
    const newItem: ChecklistItem = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      text: newCheckItem.trim(),
      checked: false,
      createdBy: user.uid,
      createdAt: Date.now(),
    };
    const updatedChecklist = [...(task.checklist || []), newItem];
    const now = Timestamp.now();
    await updateDoc(doc(db, "tasks", taskId), { checklist: updatedChecklist, updatedAt: now });
    setTask({ ...task, checklist: updatedChecklist, updatedAt: now });
    setNewCheckItem("");
  };

  const toggleCheckItem = async (itemId: string) => {
    if (!task) return;
    const updatedChecklist = (task.checklist || []).map((item) =>
      item.id === itemId ? { ...item, checked: !item.checked } : item
    );
    const now = Timestamp.now();
    await updateDoc(doc(db, "tasks", taskId), { checklist: updatedChecklist, updatedAt: now });
    setTask({ ...task, checklist: updatedChecklist, updatedAt: now });
  };

  const removeCheckItem = async (itemId: string) => {
    if (!task) return;
    const updatedChecklist = (task.checklist || []).filter((item) => item.id !== itemId);
    const now = Timestamp.now();
    await updateDoc(doc(db, "tasks", taskId), { checklist: updatedChecklist, updatedAt: now });
    setTask({ ...task, checklist: updatedChecklist, updatedAt: now });
  };

  // --- Datei-Upload durch Zugewiesene ---
  const handleAttachmentsChange = async (updatedAttachments: TaskAttachment[]) => {
    if (!task) return;
    const now = Timestamp.now();
    try {
      await updateDoc(doc(db, "tasks", taskId), { attachments: updatedAttachments, updatedAt: now });
      setTask({ ...task, attachments: updatedAttachments, updatedAt: now });
      toast.success("Dateien aktualisiert!");
    } catch (err) {
      console.error(err);
      toast.error("Fehler beim Speichern der Dateien.");
    }
  };

  // --- Freigabe-Anfragen ---
  const submitApproval = async () => {
    if (!approvalTitle.trim() || !task || !user) return;
    const newApproval: ApprovalRequest = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: approvalType,
      title: approvalTitle.trim(),
      description: approvalDescription.trim(),
      attachments: approvalAttachments,
      ...(approvalLink.trim() ? { link: approvalLink.trim() } : {}),
      status: "pending",
      createdBy: user.uid,
      createdAt: Date.now(),
    };
    const updatedApprovals = [newApproval, ...(task.approvals || [])];
    const now = Timestamp.now();
    try {
      await updateDoc(doc(db, "tasks", taskId), { approvals: updatedApprovals, updatedAt: now });
      setTask({ ...task, approvals: updatedApprovals, updatedAt: now });
      setApprovalTitle("");
      setApprovalDescription("");
      setApprovalAttachments([]);
      setApprovalLink("");
      setShowApprovalForm(false);
      toast.success("Freigabe-Anfrage gesendet!");
    } catch (err) {
      console.error(err);
      toast.error("Fehler beim Senden.");
    }
  };

  const respondToApproval = async (approvalId: string, decision: "approved" | "rejected") => {
    if (!task || !user) return;
    const updatedApprovals = (task.approvals || []).map((a) =>
      a.id === approvalId
        ? { ...a, status: decision as ApprovalStatus, respondedBy: user.uid, respondedAt: Date.now(), ...(responseNote.trim() ? { responseNote: responseNote.trim() } : {}) }
        : a
    );
    const now = Timestamp.now();
    try {
      await updateDoc(doc(db, "tasks", taskId), { approvals: updatedApprovals, updatedAt: now });
      setTask({ ...task, approvals: updatedApprovals, updatedAt: now });
      setRespondingTo(null);
      setResponseNote("");
      toast.success(decision === "approved" ? "Freigegeben!" : "Abgelehnt.");
    } catch (err) {
      console.error(err);
      toast.error("Fehler.");
    }
  };

  const deleteApproval = async (approvalId: string) => {
    if (!task || !user) return;
    const approval = (task.approvals || []).find((a) => a.id === approvalId);
    if (!approval) return;
    // Nur Ersteller oder Admin/Verwaltung dürfen löschen
    if (approval.createdBy !== user.uid && !canManageTasks(role)) return;
    const updatedApprovals = (task.approvals || []).filter((a) => a.id !== approvalId);
    const now = Timestamp.now();
    try {
      await updateDoc(doc(db, "tasks", taskId), { approvals: updatedApprovals, updatedAt: now });
      setTask({ ...task, approvals: updatedApprovals, updatedAt: now });
      toast.success("Freigabe-Anfrage gelöscht.");
    } catch (err) {
      console.error(err);
      toast.error("Fehler beim Löschen.");
    }
  };

  const toggleApprovalExpand = (id: string) => {
    setExpandedApprovals((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
  const canInteract = isAssignee || canManageTasks(role); // Zugewiesene + Manager können interagieren

  const checklist = task.checklist || [];
  const checkedCount = checklist.filter((c) => c.checked).length;

  const approvals = task.approvals || [];
  const pendingApprovals = approvals.filter((a) => a.status === "pending").length;

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

          {/* Checkliste */}
          {(canInteract || checklist.length > 0) && (
            <Card>
              <CardTitle>
                <span className="flex items-center justify-between w-full">
                  <span className="flex items-center gap-2">
                    <CheckSquare className="h-4 w-4" />
                    Checkliste
                  </span>
                  {checklist.length > 0 && (
                    <span className="text-xs font-normal text-gray-500">
                      {checkedCount}/{checklist.length} erledigt
                    </span>
                  )}
                </span>
              </CardTitle>
              <CardContent>
                {/* Fortschrittsbalken */}
                {checklist.length > 0 && (
                  <div className="mb-3 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-green-500 transition-all"
                      style={{ width: `${Math.round((checkedCount / checklist.length) * 100)}%` }}
                    />
                  </div>
                )}

                {/* Checklist Items */}
                <div className="space-y-1">
                  {checklist.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 group py-1">
                      <button
                        onClick={() => canInteract && toggleCheckItem(item.id)}
                        disabled={!canInteract}
                        className="shrink-0"
                      >
                        {item.checked ? (
                          <CheckSquare className="h-4.5 w-4.5 text-green-600" />
                        ) : (
                          <Square className="h-4.5 w-4.5 text-gray-400" />
                        )}
                      </button>
                      <span className={`text-sm flex-1 ${item.checked ? "line-through text-gray-400" : "text-gray-700"}`}>
                        {item.text}
                      </span>
                      {canInteract && (
                        <button
                          onClick={() => removeCheckItem(item.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:text-red-500 text-gray-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Neues Item hinzufügen */}
                {canInteract && (
                  <div className="mt-3 flex gap-2">
                    <Input
                      id="newCheckItem"
                      value={newCheckItem}
                      onChange={(e) => setNewCheckItem(e.target.value)}
                      placeholder="Neuer Punkt..."
                      onKeyDown={(e) => e.key === "Enter" && addCheckItem()}
                      className="flex-1"
                    />
                    <Button size="sm" onClick={addCheckItem} disabled={!newCheckItem.trim()}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Freigaben */}
          {(canInteract || approvals.length > 0) && (
            <Card>
              <CardTitle>
                <span className="flex items-center justify-between w-full">
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" />
                    Freigaben
                  </span>
                  <span className="flex items-center gap-2">
                    {pendingApprovals > 0 && (
                      <span className="flex items-center gap-1 rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-xs font-medium">
                        <CircleDot className="h-3 w-3" />
                        {pendingApprovals} offen
                      </span>
                    )}
                    {canInteract && !showApprovalForm && (
                      <Button size="sm" variant="secondary" onClick={() => setShowApprovalForm(true)}>
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        <span className="hidden sm:inline">Anfrage</span>
                      </Button>
                    )}
                  </span>
                </span>
              </CardTitle>
              <CardContent>
                {/* Neue Freigabe-Anfrage */}
                {showApprovalForm && (
                  <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50/50 p-4 space-y-3">
                    <h4 className="text-sm font-semibold text-gray-800">Neue Freigabe-Anfrage</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Select
                        id="approvalType"
                        label="Typ"
                        value={approvalType}
                        onChange={(e) => setApprovalType(e.target.value as ApprovalType)}
                        options={[
                          { value: "general", label: "Allgemeine Freigabe" },
                          { value: "file", label: "Datei-Freigabe" },
                          { value: "link", label: "Link-Freigabe" },
                          { value: "question", label: "Frage" },
                        ]}
                      />
                      <Input
                        id="approvalTitle"
                        label="Titel"
                        value={approvalTitle}
                        onChange={(e) => setApprovalTitle(e.target.value)}
                        placeholder="z.B. Logo-Entwurf v2"
                      />
                    </div>
                    <Textarea
                      id="approvalDescription"
                      label="Beschreibung (optional)"
                      value={approvalDescription}
                      onChange={(e) => setApprovalDescription(e.target.value)}
                      rows={2}
                      placeholder="Details zur Freigabe..."
                    />
                    {approvalType === "file" && (
                      <div>
                        <p className="text-xs font-medium text-gray-700 mb-1">Dateien anhängen</p>
                        <FileUpload
                          storagePath={`tasks/${taskId}/approvals`}
                          attachments={approvalAttachments}
                          onChange={setApprovalAttachments}
                        />
                      </div>
                    )}
                    {(approvalType === "link" || approvalType === "general") && (
                      <Input
                        id="approvalLink"
                        label="Link (optional)"
                        type="url"
                        value={approvalLink}
                        onChange={(e) => setApprovalLink(e.target.value)}
                        placeholder="https://..."
                      />
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" onClick={submitApproval} disabled={!approvalTitle.trim()}>
                        <Send className="h-3.5 w-3.5 mr-1" />
                        Senden
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => { setShowApprovalForm(false); setApprovalTitle(""); setApprovalDescription(""); setApprovalAttachments([]); setApprovalLink(""); }}>
                        Abbrechen
                      </Button>
                    </div>
                  </div>
                )}

                {/* Freigabe-Liste (neueste oben) */}
                {approvals.length === 0 && !showApprovalForm ? (
                  <p className="text-sm text-gray-500 text-center py-2">Noch keine Freigabe-Anfragen.</p>
                ) : (
                  <div className="space-y-2">
                    {approvals.map((approval) => {
                      const isExpanded = expandedApprovals.has(approval.id);
                      const creatorName = teamMembers.find((m) => m.uid === approval.createdBy)?.displayName || approval.createdBy;
                      const responderName = approval.respondedBy
                        ? teamMembers.find((m) => m.uid === approval.respondedBy)?.displayName || approval.respondedBy
                        : null;
                      const createdDate = new Date(approval.createdAt);

                      const typeIcon = approval.type === "file"
                        ? <Paperclip className="h-3.5 w-3.5" />
                        : approval.type === "question"
                        ? <ShieldQuestion className="h-3.5 w-3.5" />
                        : approval.type === "link"
                        ? <Globe className="h-3.5 w-3.5" />
                        : <ShieldCheck className="h-3.5 w-3.5" />;

                      const canDeleteApproval = approval.createdBy === user?.uid || canManageTasks(role);

                      const statusColor = approval.status === "pending"
                        ? "bg-orange-100 text-orange-700 border-orange-200"
                        : approval.status === "approved"
                        ? "bg-green-100 text-green-700 border-green-200"
                        : "bg-red-100 text-red-700 border-red-200";

                      return (
                        <div
                          key={approval.id}
                          className={`rounded-lg border p-3 transition-all ${
                            approval.status === "pending" ? "border-orange-200 bg-orange-50/30" : "border-gray-100"
                          }`}
                        >
                          {/* Header */}
                          <div
                            className="flex items-center gap-2 cursor-pointer"
                            onClick={() => toggleApprovalExpand(approval.id)}
                          >
                            <span className={`shrink-0 rounded-full p-1 ${statusColor}`}>
                              {typeIcon}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-900 truncate">{approval.title}</span>
                                <span className={`text-xs px-1.5 py-0.5 rounded-full ${statusColor}`}>
                                  {APPROVAL_STATUS_LABELS[approval.status]}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500">
                                {creatorName} · {createdDate.toLocaleDateString("de-DE")} {createdDate.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                                {" · "}{APPROVAL_TYPE_LABELS[approval.type]}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {canDeleteApproval && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); deleteApproval(approval.id); }}
                                  className="p-1 hover:text-red-500 text-gray-400 transition-colors"
                                  title="Löschen"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4 text-gray-400" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-gray-400" />
                              )}
                            </div>
                          </div>

                          {/* Expanded Content */}
                          {isExpanded && (
                            <div className="mt-3 pl-8 space-y-3">
                              {approval.description && (
                                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                                  {approval.description.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
                                    /^https?:\/\//.test(part) ? (
                                      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">{part}</a>
                                    ) : (
                                      <span key={i}>{part}</span>
                                    )
                                  )}
                                </p>
                              )}

                              {/* Link anzeigen */}
                              {approval.link && (
                                <a
                                  href={approval.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline break-all"
                                >
                                  <Globe className="h-3.5 w-3.5 shrink-0" />
                                  {approval.link}
                                  <ExternalLink className="h-3 w-3 shrink-0" />
                                </a>
                              )}

                              {/* Angehängte Dateien */}
                              {approval.attachments && approval.attachments.length > 0 && (
                                <div>
                                  <p className="text-xs font-medium text-gray-500 mb-1">Anhänge:</p>
                                  <FileList attachments={approval.attachments} />
                                </div>
                              )}

                              {/* Antwort anzeigen */}
                              {approval.status !== "pending" && (
                                <div className={`rounded-lg p-3 ${
                                  approval.status === "approved" ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
                                }`}>
                                  <div className="flex items-center gap-2 mb-1">
                                    {approval.status === "approved" ? (
                                      <CheckCircle className="h-4 w-4 text-green-600" />
                                    ) : (
                                      <AlertTriangle className="h-4 w-4 text-red-600" />
                                    )}
                                    <span className="text-sm font-medium">
                                      {approval.status === "approved" ? "Freigegeben" : "Abgelehnt"} von {responderName}
                                    </span>
                                  </div>
                                  {approval.responseNote && (
                                    <p className="text-sm text-gray-700 ml-6">{approval.responseNote}</p>
                                  )}
                                  {approval.respondedAt && (
                                    <p className="text-xs text-gray-400 ml-6 mt-1">
                                      {new Date(approval.respondedAt).toLocaleDateString("de-DE")} {new Date(approval.respondedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                                    </p>
                                  )}
                                </div>
                              )}

                              {/* Antwort-Formular (nur für Manager bei pending) */}
                              {approval.status === "pending" && canManageTasks(role) && (
                                <>
                                  {respondingTo === approval.id ? (
                                    <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-3">
                                      <Textarea
                                        id={`response-${approval.id}`}
                                        label="Anmerkung (optional)"
                                        value={responseNote}
                                        onChange={(e) => setResponseNote(e.target.value)}
                                        rows={2}
                                        placeholder="Kommentar zur Freigabe..."
                                      />
                                      <div className="flex gap-2">
                                        <Button size="sm" onClick={() => respondToApproval(approval.id, "approved")}>
                                          <CheckCircle className="h-3.5 w-3.5 mr-1" />
                                          Freigeben
                                        </Button>
                                        <Button size="sm" variant="danger" onClick={() => respondToApproval(approval.id, "rejected")}>
                                          <X className="h-3.5 w-3.5 mr-1" />
                                          Ablehnen
                                        </Button>
                                        <Button size="sm" variant="secondary" onClick={() => { setRespondingTo(null); setResponseNote(""); }}>
                                          Abbrechen
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <Button size="sm" variant="secondary" onClick={() => setRespondingTo(approval.id)}>
                                      <MessageSquare className="h-3.5 w-3.5 mr-1" />
                                      Antworten
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Dateien hochladen (Zugewiesene + Manager) */}
          {canInteract && (
            <Card>
              <CardTitle>
                <span className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Dateien hochladen
                </span>
              </CardTitle>
              <CardContent>
                <FileUpload
                  storagePath={`tasks/${taskId}`}
                  attachments={task.attachments || []}
                  onChange={(updated) => handleAttachmentsChange(updated)}
                />
              </CardContent>
            </Card>
          )}

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
                  {pendingApprovals > 0 && (
                    <div>
                      <dt className="text-gray-500">Offene Freigaben</dt>
                      <dd>
                        <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-xs font-medium">
                          <CircleDot className="h-3 w-3" />
                          {pendingApprovals} offen
                        </span>
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
