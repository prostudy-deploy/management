"use client";

import { useAuth } from "@/context/AuthContext";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { useState } from "react";
import { collection, addDoc, doc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";
import { TaskAttachment } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Card } from "@/components/ui/Card";
import { FileUpload } from "@/components/ui/FileUpload";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function AbgabePage() {
  return (
    <AuthGuard>
      <AbgabeContent />
    </AuthGuard>
  );
}

function AbgabeContent() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const taskId = params.id as string;

  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !content.trim()) return;
    setSaving(true);

    try {
      await addDoc(collection(db, "submissions"), {
        taskId,
        submittedBy: user.uid,
        content,
        attachments,
        aiFeedback: null,
        aiStatus: "pending",
        submittedAt: Timestamp.now(),
      });

      await updateDoc(doc(db, "tasks", taskId), {
        status: "submitted",
        updatedAt: Timestamp.now(),
      });

      toast.success("Abgabe eingereicht! KI-Feedback wird generiert...");
      router.push(`/aufgaben/${taskId}`);
    } catch (err) {
      console.error(err);
      toast.error("Fehler beim Einreichen.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Link
        href={`/aufgaben/${taskId}`}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Zurück zur Aufgabe
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Abgabe einreichen</h1>

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        <Card>
          <Textarea
            id="content"
            label="Deine Abgabe"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Beschreibe deine Lösung, füge Links ein, erkläre deinen Ansatz..."
            className="min-h-[200px]"
            required
          />
          <p className="mt-2 text-xs text-gray-500">
            Nach dem Einreichen wird automatisch KI-Feedback generiert.
          </p>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Dateien anhängen</h3>
          <FileUpload
            storagePath={`submissions/${taskId}`}
            attachments={attachments}
            onChange={setAttachments}
          />
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? "Wird eingereicht..." : "Abgabe einreichen"}
          </Button>
          <Link href={`/aufgaben/${taskId}`}>
            <Button type="button" variant="secondary">
              Abbrechen
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
