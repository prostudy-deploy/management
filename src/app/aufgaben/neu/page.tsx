"use client";

import { useAuth } from "@/context/AuthContext";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { useState, useEffect } from "react";
import { collection, addDoc, getDocs, query, where, orderBy, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";
import { AppUser, TaskCategory, TaskPriority, TaskLink, LinkType, TaskAttachment, Project, canManageTasks } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import { FileUpload } from "@/components/ui/FileUpload";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Plus, X, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NeueAufgabePage() {
  return (
    <AuthGuard>
      <NeueAufgabeContent />
    </AuthGuard>
  );
}

function NeueAufgabeContent() {
  const { user, role } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [teamMembers, setTeamMembers] = useState<AppUser[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [category, setCategory] = useState<TaskCategory>("marketing");
  const [projectId, setProjectId] = useState(searchParams.get("projektId") || "");
  const [deadline, setDeadline] = useState("");
  const [links, setLinks] = useState<TaskLink[]>([]);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);

  // Link-Formular State
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [linkType, setLinkType] = useState<LinkType>("other");

  useEffect(() => {
    async function loadData() {
      const q = query(collection(db, "users"), where("isActive", "==", true));
      const snapshot = await getDocs(q);
      const members = snapshot.docs.map((doc) => ({
        uid: doc.id,
        ...doc.data(),
      })) as AppUser[];
      setTeamMembers(members.filter((m) => m.role !== "admin"));

      // Projekte laden
      const projSnap = await getDocs(
        query(collection(db, "projects"), where("status", "==", "active"), orderBy("createdAt", "desc"))
      );
      setProjects(projSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Project)));
    }
    loadData();
  }, []);

  if (!canManageTasks(role)) {
    return <p className="text-red-600">Keine Berechtigung.</p>;
  }

  const addLink = () => {
    if (!linkUrl) return;
    setLinks([...links, { url: linkUrl, label: linkLabel || linkUrl, type: linkType }]);
    setLinkUrl("");
    setLinkLabel("");
    setLinkType("other");
  };

  const removeLink = (index: number) => {
    setLinks(links.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);

    try {
      const now = Timestamp.now();
      await addDoc(collection(db, "tasks"), {
        title,
        description,
        assignedTo: assignedTo || null,
        createdBy: user.uid,
        status: assignedTo ? "assigned" : "created",
        priority,
        category,
        projectId: projectId || null,
        deadline: deadline ? Timestamp.fromDate(new Date(deadline)) : null,
        links,
        attachments,
        createdAt: now,
        updatedAt: now,
      });

      toast.success("Aufgabe erstellt!");
      router.push("/aufgaben");
    } catch (err) {
      console.error(err);
      toast.error("Fehler beim Erstellen der Aufgabe.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Link href="/aufgaben" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="h-4 w-4" />
        Zurück
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Neue Aufgabe</h1>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
        <Card>
          <div className="space-y-4">
            <Input
              id="title"
              label="Titel"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Aufgabentitel"
              required
            />

            <Textarea
              id="description"
              label="Beschreibung"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detaillierte Beschreibung der Aufgabe..."
              required
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                id="assignedTo"
                label="Zuweisen an"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                options={[
                  { value: "", label: "Nicht zugewiesen" },
                  ...teamMembers.map((m) => ({
                    value: m.uid,
                    label: `${m.displayName} (${m.role})`,
                  })),
                ]}
              />

              <Select
                id="category"
                label="Kategorie"
                value={category}
                onChange={(e) => setCategory(e.target.value as TaskCategory)}
                options={[
                  { value: "marketing", label: "Marketing" },
                  { value: "verwaltung", label: "Verwaltung" },
                  { value: "sonstiges", label: "Sonstiges" },
                ]}
              />
            </div>

            <Select
              id="projectId"
              label="Projekt"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              options={[
                { value: "", label: "Kein Projekt" },
                ...projects.map((p) => ({
                  value: p.id,
                  label: p.name,
                })),
              ]}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                id="priority"
                label="Priorität"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                options={[
                  { value: "low", label: "Niedrig" },
                  { value: "medium", label: "Mittel" },
                  { value: "high", label: "Hoch" },
                ]}
              />

              <Input
                id="deadline"
                label="Deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
          </div>
        </Card>

        {/* Links */}
        <Card>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Links & Ressourcen</h3>

          {links.length > 0 && (
            <div className="space-y-2 mb-4">
              {links.map((link, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm"
                >
                  <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 capitalize">
                    {link.type}
                  </span>
                  <span className="flex-1 truncate">{link.label}</span>
                  <button
                    type="button"
                    onClick={() => removeLink(i)}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Select
              id="linkType"
              value={linkType}
              onChange={(e) => setLinkType(e.target.value as LinkType)}
              options={[
                { value: "meeting", label: "Meeting" },
                { value: "canva", label: "Canva" },
                { value: "document", label: "Dokument" },
                { value: "other", label: "Sonstiges" },
              ]}
              className="w-32"
            />
            <Input
              id="linkLabel"
              value={linkLabel}
              onChange={(e) => setLinkLabel(e.target.value)}
              placeholder="Bezeichnung"
              className="w-40"
            />
            <Input
              id="linkUrl"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://..."
              className="flex-1"
            />
            <Button type="button" variant="secondary" onClick={addLink}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </Card>

        {/* Dateien */}
        <Card>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Dateien</h3>
          <FileUpload
            storagePath={`tasks/new_${Date.now()}`}
            attachments={attachments}
            onChange={setAttachments}
          />
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? "Wird erstellt..." : "Aufgabe erstellen"}
          </Button>
          <Link href="/aufgaben">
            <Button type="button" variant="secondary">
              Abbrechen
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
