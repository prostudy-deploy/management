"use client";

import { useAuth } from "@/context/AuthContext";
import { useEffect, useState, useCallback } from "react";
import { doc, getDoc, setDoc, deleteDoc, addDoc, collection, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";
import { Button } from "@/components/ui/Button";
import { Play, Square, Clock } from "lucide-react";
import { toast } from "sonner";

export function TimerWidget() {
  const { user } = useAuth();
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState("00:00:00");
  const [loading, setLoading] = useState(false);
  const [hourlyRate, setHourlyRate] = useState(0);

  // Timer-Status aus Firestore laden
  useEffect(() => {
    if (!user) return;

    async function loadTimer() {
      // Aktiven Timer laden
      const timerDoc = await getDoc(doc(db, "activeTimers", user!.uid));
      if (timerDoc.exists()) {
        const data = timerDoc.data();
        setStartedAt(data.startedAt.toDate());
      }

      // Stundenlohn laden
      const userDoc = await getDoc(doc(db, "users", user!.uid));
      if (userDoc.exists()) {
        setHourlyRate(userDoc.data().hourlyRate || 0);
      }
    }
    loadTimer();
  }, [user]);

  // Elapsed Time updaten (jede Sekunde)
  useEffect(() => {
    if (!startedAt) {
      setElapsed("00:00:00");
      return;
    }

    function updateElapsed() {
      const now = new Date();
      const diff = Math.floor((now.getTime() - startedAt!.getTime()) / 1000);
      const hrs = Math.floor(diff / 3600);
      const mins = Math.floor((diff % 3600) / 60);
      const secs = diff % 60;
      setElapsed(
        `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
      );
    }

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const handleStart = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      const now = Timestamp.now();
      await setDoc(doc(db, "activeTimers", user.uid), {
        uid: user.uid,
        startedAt: now,
      });
      setStartedAt(now.toDate());
      toast.success("Timer gestartet!");
    } catch (err) {
      console.error(err);
      toast.error("Fehler beim Starten.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  const handleStop = useCallback(async () => {
    if (!user || !startedAt) return;
    setLoading(true);

    try {
      const now = new Date();
      const durationMs = now.getTime() - startedAt.getTime();
      const durationMinutes = Math.round(durationMs / 60000);
      const hours = durationMinutes / 60;
      const earned = Math.round(hours * hourlyRate * 100) / 100;

      // Zeiteintrag speichern
      await addDoc(collection(db, "timeEntries"), {
        uid: user.uid,
        startedAt: Timestamp.fromDate(startedAt),
        stoppedAt: Timestamp.now(),
        durationMinutes,
        earned,
      });

      // Aktiven Timer löschen
      await deleteDoc(doc(db, "activeTimers", user.uid));

      setStartedAt(null);

      const hrs = Math.floor(durationMinutes / 60);
      const mins = durationMinutes % 60;
      toast.success(
        `Timer gestoppt! ${hrs}h ${mins}min${hourlyRate > 0 ? ` = ${earned.toFixed(2)} EUR` : ""}`
      );
    } catch (err) {
      console.error(err);
      toast.error("Fehler beim Stoppen.");
    } finally {
      setLoading(false);
    }
  }, [user, startedAt, hourlyRate]);

  const isRunning = startedAt !== null;

  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-mono ${
          isRunning
            ? "bg-green-50 text-green-700 border border-green-200"
            : "bg-gray-50 text-gray-500 border border-gray-200"
        }`}
      >
        <Clock className={`h-4 w-4 ${isRunning ? "text-green-600 animate-pulse" : ""}`} />
        <span className="min-w-[65px]">{elapsed}</span>
      </div>

      {isRunning ? (
        <Button
          size="sm"
          variant="danger"
          onClick={handleStop}
          disabled={loading}
          className="h-8 w-8 p-0"
        >
          <Square className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <Button
          size="sm"
          onClick={handleStart}
          disabled={loading}
          className="h-8 w-8 p-0"
        >
          <Play className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
