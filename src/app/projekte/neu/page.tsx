"use client";

import { useAuth } from "@/context/AuthContext";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { useState } from "react";
import { collection, addDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";
import { PROJECT_COLORS, canManageTasks } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Card } from "@/components/ui/Card";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Check } from "lucide-react";
import Link from "next/link";

export default function NeuesProjektPage() {
  return (
    <AuthGuard>
      <NeuesProjektContent />
    </AuthGuard>
  );
}

function NeuesProjektContent() {
  const { user, role } = useAuth();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(PROJECT_COLORS[0].value);

  if (!canManageTasks(role)) {
    return <p className="text-red-600">Keine Berechtigung.</p>;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);

    try {
      const now = Timestamp.now();
      await addDoc(collection(db, "projects"), {
        name,
        description,
        status: "active",
        color,
        createdBy: user.uid,
        createdAt: now,
        updatedAt: now,
      });

      toast.success("Projekt erstellt!");
      router.push("/projekte");
    } catch (err) {
      console.error(err);
      toast.error("Fehler beim Erstellen des Projekts.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Link href="/projekte" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="h-4 w-4" />
        Zurück
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Neues Projekt</h1>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">
        <Card>
          <div className="space-y-4">
            <Input
              id="name"
              label="Projektname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Instagram Relaunch Q2"
              required
            />

            <Textarea
              id="description"
              label="Beschreibung"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Worum geht es in diesem Projekt?"
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Farbe</label>
              <div className="flex flex-wrap gap-2">
                {PROJECT_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setColor(c.value)}
                    className="relative h-8 w-8 rounded-full transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2"
                    style={{ backgroundColor: c.value, focusRingColor: c.value } as any}
                    title={c.label}
                  >
                    {color === c.value && (
                      <Check className="h-4 w-4 text-white absolute inset-0 m-auto" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? "Wird erstellt..." : "Projekt erstellen"}
          </Button>
          <Link href="/projekte">
            <Button type="button" variant="secondary">
              Abbrechen
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
