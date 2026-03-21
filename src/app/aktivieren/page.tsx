"use client";

import { useState } from "react";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { collection, query, where, getDocs, doc, setDoc, updateDoc, Timestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/firebase";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { useRouter } from "next/navigation";
import { CheckCircle, AlertCircle } from "lucide-react";

type Step = "email" | "password" | "success" | "error";

export default function AktivierenPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [invitationName, setInvitationName] = useState("");
  const [invitationRole, setInvitationRole] = useState("");
  const [invitationId, setInvitationId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Schritt 1: E-Mail prüfen - gibt es eine Einladung?
  const handleCheckEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const q = query(
        collection(db, "invitations"),
        where("email", "==", email.toLowerCase().trim()),
        where("status", "==", "pending")
      );
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        setError("Keine Einladung für diese E-Mail gefunden. Bitte wende dich an deinen Admin.");
        setLoading(false);
        return;
      }

      const invitation = snapshot.docs[0];
      const data = invitation.data();
      setInvitationId(invitation.id);
      setInvitationName(data.displayName);
      setInvitationRole(data.role);
      setStep("password");
    } catch (err) {
      console.error(err);
      setError("Fehler beim Prüfen der Einladung.");
    } finally {
      setLoading(false);
    }
  };

  // Schritt 2: Passwort setzen und Account erstellen
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Passwort muss mindestens 6 Zeichen lang sein.");
      return;
    }

    if (password !== passwordConfirm) {
      setError("Passwörter stimmen nicht überein.");
      return;
    }

    setLoading(true);

    try {
      // Firebase Auth Account erstellen
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email.toLowerCase().trim(),
        password
      );

      const user = userCredential.user;

      // Display Name setzen
      await updateProfile(user, { displayName: invitationName });

      // User-Dokument in Firestore erstellen
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        email: email.toLowerCase().trim(),
        displayName: invitationName,
        role: invitationRole,
        isActive: true,
        createdAt: Timestamp.now(),
      });

      // Einladung als aktiviert markieren
      await updateDoc(doc(db, "invitations", invitationId), {
        status: "activated",
        activatedAt: Timestamp.now(),
      });

      setStep("success");
    } catch (err: unknown) {
      console.error(err);
      const firebaseError = err as { code?: string };
      if (firebaseError.code === "auth/email-already-in-use") {
        setError("Es existiert bereits ein Account mit dieser E-Mail. Bitte melde dich direkt an.");
      } else {
        setError("Fehler beim Erstellen des Accounts. Bitte versuche es erneut.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-blue-600">ProStudy</h1>
            <p className="mt-1 text-sm text-gray-500">Account aktivieren</p>
          </div>

          {/* Schritt 1: E-Mail eingeben */}
          {step === "email" && (
            <form onSubmit={handleCheckEmail} className="space-y-4">
              <p className="text-sm text-gray-600">
                Gib deine E-Mail-Adresse ein, um deinen Account zu aktivieren.
                Du brauchst eine Einladung von deinem Admin.
              </p>
              <Input
                id="email"
                label="E-Mail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@prostudy.de"
                required
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Wird geprüft..." : "Weiter"}
              </Button>
              <p className="text-center text-xs text-gray-400">
                Bereits ein Konto?{" "}
                <a href="/login" className="text-blue-600 hover:underline">
                  Anmelden
                </a>
              </p>
            </form>
          )}

          {/* Schritt 2: Passwort vergeben */}
          {step === "password" && (
            <form onSubmit={handleCreateAccount} className="space-y-4">
              <Card className="bg-green-50 border-green-200">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-green-800">
                      Einladung gefunden!
                    </p>
                    <p className="text-xs text-green-600">
                      {invitationName} - {invitationRole}
                    </p>
                  </div>
                </div>
              </Card>

              <p className="text-sm text-gray-600">
                Vergib jetzt ein Passwort für deinen Account.
              </p>

              <Input
                id="password"
                label="Passwort"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mindestens 6 Zeichen"
                required
              />
              <Input
                id="passwordConfirm"
                label="Passwort bestätigen"
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                placeholder="Passwort wiederholen"
                required
              />

              {error && <p className="text-sm text-red-600">{error}</p>}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Account wird erstellt..." : "Account erstellen"}
              </Button>

              <button
                type="button"
                onClick={() => { setStep("email"); setError(""); }}
                className="w-full text-center text-xs text-gray-400 hover:text-gray-600"
              >
                Zurück
              </button>
            </form>
          )}

          {/* Erfolg */}
          {step === "success" && (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <CheckCircle className="h-16 w-16 text-green-500" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">
                Account aktiviert!
              </h2>
              <p className="text-sm text-gray-600">
                Willkommen bei ProStudy, {invitationName}! Dein Account ist jetzt bereit.
              </p>
              <Button
                className="w-full"
                onClick={() => router.push("/dashboard")}
              >
                Zum Dashboard
              </Button>
            </div>
          )}

          {/* Fehler */}
          {step === "error" && (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <AlertCircle className="h-16 w-16 text-red-500" />
              </div>
              <p className="text-sm text-red-600">{error}</p>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => { setStep("email"); setError(""); }}
              >
                Erneut versuchen
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
