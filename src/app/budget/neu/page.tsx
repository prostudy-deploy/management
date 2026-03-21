"use client";

import { useAuth } from "@/context/AuthContext";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { useState, useEffect } from "react";
import { collection, addDoc, getDocs, query, where, orderBy, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";
import { Project } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NeuesBudgetPage() {
  return (
    <AuthGuard>
      <NeuesBudgetContent />
    </AuthGuard>
  );
}

function NeuesBudgetContent() {
  const { user, role } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [saving, setSaving] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [totalBudget, setTotalBudget] = useState("");
  const [period, setPeriod] = useState("");
  const [projectId, setProjectId] = useState(searchParams.get("projektId") || "");

  useEffect(() => {
    async function loadProjects() {
      const projSnap = await getDocs(
        query(collection(db, "projects"), where("status", "==", "active"), orderBy("createdAt", "desc"))
      );
      setProjects(projSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Project)));
    }
    loadProjects();
  }, []);

  if (role !== "admin" && role !== "verwaltung") {
    return <p className="text-red-600">Keine Berechtigung.</p>;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);

    try {
      const now = Timestamp.now();
      await addDoc(collection(db, "budgets"), {
        title,
        category,
        totalBudget: parseFloat(totalBudget) || 0,
        spent: 0,
        entries: [],
        createdBy: user.uid,
        projectId: projectId || null,
        period,
        createdAt: now,
        updatedAt: now,
      });

      toast.success("Budget erstellt!");
      router.push("/budget");
    } catch (err) {
      console.error(err);
      toast.error("Fehler beim Erstellen.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Link href="/budget" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="h-4 w-4" />
        Zurück
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Neues Budget</h1>

      <form onSubmit={handleSubmit} className="max-w-lg space-y-6">
        <Card>
          <div className="space-y-4">
            <Input
              id="title"
              label="Titel"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z.B. Marketing Q1 2026"
              required
            />
            <Input
              id="category"
              label="Kategorie"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="z.B. Social Media, Flyer, Werbung"
              required
            />
            <Input
              id="totalBudget"
              label="Gesamtbudget (EUR)"
              type="number"
              min="0"
              step="0.01"
              value={totalBudget}
              onChange={(e) => setTotalBudget(e.target.value)}
              placeholder="0.00"
              required
            />
            <Input
              id="period"
              label="Zeitraum"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="z.B. Q1 2026, März 2026"
              required
            />
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
          </div>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? "Wird erstellt..." : "Budget erstellen"}
          </Button>
          <Link href="/budget">
            <Button type="button" variant="secondary">
              Abbrechen
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
