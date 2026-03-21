"use client";

import { useAuth } from "@/context/AuthContext";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { useEffect, useState } from "react";
import {
  doc,
  getDoc,
  updateDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";
import { Task, Submission, ReviewDecision, canManageTasks } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Card, CardTitle, CardContent } from "@/components/ui/Card";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { ArrowLeft, Star, CheckCircle, XCircle, RotateCcw } from "lucide-react";

export default function BewertungPage() {
  return (
    <AuthGuard>
      <BewertungContent />
    </AuthGuard>
  );
}

function BewertungContent() {
  const { user, role } = useAuth();
  const router = useRouter();
  const params = useParams();
  const taskId = params.id as string;

  const [task, setTask] = useState<Task | null>(null);
  const [latestSubmission, setLatestSubmission] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);

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
      if (subSnapshot.docs.length > 0) {
        setLatestSubmission({
          id: subSnapshot.docs[0].id,
          ...subSnapshot.docs[0].data(),
        } as Submission);
      }

      setLoading(false);
    }
    load();
  }, [taskId]);

  if (!canManageTasks(role)) {
    return <p className="text-red-600">Keine Berechtigung.</p>;
  }

  const handleDecision = async (decision: ReviewDecision) => {
    if (!user || !latestSubmission) return;
    setSaving(true);

    try {
      await addDoc(collection(db, "reviews"), {
        taskId,
        submissionId: latestSubmission.id,
        reviewedBy: user.uid,
        decision,
        feedback,
        reviewedAt: Timestamp.now(),
      });

      const newStatus = decision === "approved" ? "approved" : "rejected";
      await updateDoc(doc(db, "tasks", taskId), {
        status: newStatus,
        updatedAt: Timestamp.now(),
      });

      const label = decision === "approved" ? "freigegeben" : "abgelehnt";
      toast.success(`Aufgabe ${label}!`);
      router.push(`/aufgaben/${taskId}`);
    } catch (err) {
      console.error(err);
      toast.error("Fehler bei der Bewertung.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!task || !latestSubmission) {
    return <p className="text-gray-500">Keine Abgabe vorhanden.</p>;
  }

  return (
    <div>
      <Link
        href={`/aufgaben/${taskId}`}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Zurück zur Aufgabe
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Bewertung: {task.title}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl">
        {/* Left: Submission + AI Feedback */}
        <div className="space-y-6">
          <Card>
            <CardTitle>Abgabe</CardTitle>
            <CardContent>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{latestSubmission.content}</p>
              <p className="mt-3 text-xs text-gray-400">
                Eingereicht: {latestSubmission.submittedAt?.toDate().toLocaleDateString("de-DE")}
              </p>
            </CardContent>
          </Card>

          {latestSubmission.aiFeedback && (
            <Card className="border-blue-200 bg-blue-50/50">
              <CardTitle>KI-Feedback (Gemini)</CardTitle>
              <CardContent>
                <p className="text-sm text-gray-700 mb-3">{latestSubmission.aiFeedback.summary}</p>

                {latestSubmission.aiFeedback.score !== null && (
                  <div className="flex items-center gap-1 mb-3">
                    <Star className="h-5 w-5 text-yellow-500" />
                    <span className="text-lg font-bold">{latestSubmission.aiFeedback.score}/10</span>
                  </div>
                )}

                {latestSubmission.aiFeedback.strengths.length > 0 && (
                  <div className="mb-3">
                    <p className="text-sm font-medium text-green-700 mb-1">Stärken</p>
                    <ul className="space-y-1">
                      {latestSubmission.aiFeedback.strengths.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                          <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {latestSubmission.aiFeedback.improvements.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-orange-700 mb-1">Verbesserungsvorschläge</p>
                    <ul className="space-y-1">
                      {latestSubmission.aiFeedback.improvements.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                          <RotateCcw className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Review Form */}
        <div>
          <Card>
            <CardTitle>Deine Bewertung</CardTitle>
            <CardContent>
              <div className="space-y-4">
                <Textarea
                  id="feedback"
                  label="Feedback"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Dein Feedback zur Abgabe..."
                  className="min-h-[150px]"
                />

                <div className="flex flex-col gap-3">
                  <Button
                    onClick={() => handleDecision("approved")}
                    disabled={saving}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Freigeben
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => handleDecision("rejected")}
                    disabled={saving}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Ablehnen
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => handleDecision("revision_requested")}
                    disabled={saving}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Überarbeitung anfordern
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
