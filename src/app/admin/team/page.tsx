"use client";

import { useAuth } from "@/context/AuthContext";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { useEffect, useState } from "react";
import { collection, getDocs, doc, updateDoc, addDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";
import { AppUser, Invitation, UserRole } from "@/lib/types";
import { Card, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { toast } from "sonner";
import { Plus, UserCheck, UserX, Copy, Mail, Euro } from "lucide-react";

export default function TeamPage() {
  return (
    <AuthGuard>
      <TeamContent />
    </AuthGuard>
  );
}

function TeamContent() {
  const { role } = useAuth();
  const [members, setMembers] = useState<AppUser[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  // Add Form State
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("marketing");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [usersSnap, invitesSnap] = await Promise.all([
      getDocs(collection(db, "users")),
      getDocs(collection(db, "invitations")),
    ]);
    setMembers(
      usersSnap.docs.map((doc) => ({ uid: doc.id, ...doc.data() } as AppUser))
    );
    setInvitations(
      invitesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Invitation))
    );
    setLoading(false);
  }

  if (role !== "admin") {
    return <p className="text-red-600">Keine Berechtigung.</p>;
  }

  const toggleActive = async (member: AppUser) => {
    await updateDoc(doc(db, "users", member.uid), {
      isActive: !member.isActive,
    });
    toast.success(
      member.isActive ? "Mitarbeiter deaktiviert" : "Mitarbeiter aktiviert"
    );
    loadData();
  };

  const updateHourlyRate = async (member: AppUser, rate: string) => {
    const parsed = parseFloat(rate);
    if (isNaN(parsed) || parsed < 0) return;
    await updateDoc(doc(db, "users", member.uid), {
      hourlyRate: parsed,
    });
    toast.success(`Stundenlohn für ${member.displayName} aktualisiert.`);
    loadData();
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newName) return;
    setSaving(true);

    try {
      await addDoc(collection(db, "invitations"), {
        email: newEmail.toLowerCase().trim(),
        displayName: newName,
        role: newRole,
        status: "pending",
        createdAt: Timestamp.now(),
      });

      toast.success("Einladung erstellt! Teile den Aktivierungslink.");
      setShowAddForm(false);
      setNewEmail("");
      setNewName("");
      setNewRole("marketing");
      loadData();
    } catch (err) {
      console.error(err);
      toast.error("Fehler beim Erstellen der Einladung.");
    } finally {
      setSaving(false);
    }
  };

  const copyActivationLink = () => {
    const link = `${window.location.origin}/aktivieren`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link);
      toast.success("Aktivierungslink kopiert!");
    } else {
      // Fallback für nicht-HTTPS (z.B. lokales Netzwerk)
      const textArea = document.createElement("textarea");
      textArea.value = link;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      toast.success("Aktivierungslink kopiert!");
    }
  };

  const pendingInvitations = invitations.filter((i) => i.status === "pending");
  const activatedInvitations = invitations.filter((i) => i.status === "activated");

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
        <h1 className="text-2xl font-bold text-gray-900">Team</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={copyActivationLink}>
            <Copy className="h-4 w-4 mr-2" />
            Aktivierungslink
          </Button>
          <Button onClick={() => setShowAddForm(!showAddForm)}>
            <Plus className="h-4 w-4 mr-2" />
            Einladen
          </Button>
        </div>
      </div>

      {showAddForm && (
        <Card className="mb-6">
          <CardTitle>Mitarbeiter einladen</CardTitle>
          <CardContent>
            <p className="text-xs text-gray-500 mb-4">
              Gib Name, E-Mail und Rolle ein. Der Mitarbeiter kann sich dann auf der Aktivierungsseite selbst ein Passwort vergeben.
            </p>
            <form onSubmit={handleInvite} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  id="name"
                  label="Name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Vor- und Nachname"
                  required
                />
                <Input
                  id="email"
                  label="E-Mail"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="name@prostudy.de"
                  required
                />
              </div>
              <Select
                id="role"
                label="Rolle"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as UserRole)}
                options={[
                  { value: "marketing", label: "Marketing" },
                  { value: "verwaltung", label: "Verwaltung" },
                  { value: "admin", label: "Admin" },
                ]}
              />
              <div className="flex gap-3">
                <Button type="submit" disabled={saving}>
                  <Mail className="h-4 w-4 mr-2" />
                  {saving ? "Wird erstellt..." : "Einladung erstellen"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowAddForm(false)}
                >
                  Abbrechen
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Offene Einladungen */}
      {pendingInvitations.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Offene Einladungen ({pendingInvitations.length})
          </h2>
          <div className="space-y-3">
            {pendingInvitations.map((inv) => (
              <Card key={inv.id}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-100 text-yellow-700 font-medium">
                      {inv.displayName?.charAt(0)?.toUpperCase() || "?"}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{inv.displayName}</p>
                      <p className="text-sm text-gray-500">{inv.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="info">{inv.role}</Badge>
                    <Badge variant="warning">Ausstehend</Badge>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Aktive Mitglieder */}
      <h2 className="text-lg font-semibold text-gray-900 mb-3">
        Team ({members.length})
      </h2>
      {members.length === 0 ? (
        <p className="text-gray-500 text-center py-12">Keine Teammitglieder.</p>
      ) : (
        <div className="space-y-3">
          {members.map((member) => (
            <Card key={member.uid}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-medium">
                    {member.displayName?.charAt(0)?.toUpperCase() || "?"}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{member.displayName}</p>
                    <p className="text-sm text-gray-500">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* Stundenlohn */}
                  <div className="flex items-center gap-1">
                    <Euro className="h-3.5 w-3.5 text-gray-400" />
                    <input
                      type="number"
                      min="0"
                      step="0.50"
                      defaultValue={member.hourlyRate || 0}
                      onBlur={(e) => updateHourlyRate(member, e.target.value)}
                      className="w-16 rounded border border-gray-200 px-1.5 py-0.5 text-xs text-right focus:border-blue-500 focus:outline-none"
                    />
                    <span className="text-xs text-gray-400">/h</span>
                  </div>
                  <Badge variant="info">{member.role}</Badge>
                  <Badge variant={member.isActive ? "success" : "danger"}>
                    {member.isActive ? "Aktiv" : "Inaktiv"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleActive(member)}
                  >
                    {member.isActive ? (
                      <UserX className="h-4 w-4 text-red-500" />
                    ) : (
                      <UserCheck className="h-4 w-4 text-green-500" />
                    )}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
