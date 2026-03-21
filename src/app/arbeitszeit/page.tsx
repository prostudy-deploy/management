"use client";

import { useAuth } from "@/context/AuthContext";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { useEffect, useState, useMemo } from "react";
import { collection, query, where, getDocs, orderBy, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";
import { TimeEntry, AppUser, canViewBilling } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Clock, Euro, Calendar, User, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

const MONTH_NAMES = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

export default function ArbeitszeitPage() {
  return (
    <AuthGuard>
      <ArbeitszeitContent />
    </AuthGuard>
  );
}

function ArbeitszeitContent() {
  const { user, role } = useAuth();
  const [entries, setEntries] = useState<(TimeEntry & { userName?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRate, setUserRate] = useState(0);
  const [filterUid, setFilterUid] = useState<string>("self");
  const [teamMembers, setTeamMembers] = useState<AppUser[]>([]);

  // Monat-Navigation
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());

  const isAdmin = role === "admin";

  useEffect(() => {
    async function load() {
      if (!user) return;

      // Stundenlohn laden
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        setUserRate(userDoc.data().hourlyRate || 0);
      }

      // Team laden (nur Admin)
      if (isAdmin) {
        const usersSnap = await getDocs(collection(db, "users"));
        setTeamMembers(
          usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser))
        );
      }

      // Zeiteinträge laden
      let q;
      if (isAdmin) {
        q = query(collection(db, "timeEntries"), orderBy("startedAt", "desc"));
      } else {
        q = query(
          collection(db, "timeEntries"),
          where("uid", "==", user.uid),
          orderBy("startedAt", "desc")
        );
      }

      const snapshot = await getDocs(q);
      const rawEntries = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as TimeEntry[];

      if (isAdmin) {
        const usersSnap = await getDocs(collection(db, "users"));
        const usersMap: Record<string, string> = {};
        usersSnap.docs.forEach((d) => {
          usersMap[d.id] = d.data().displayName || d.data().email;
        });
        setEntries(
          rawEntries.map((e) => ({ ...e, userName: usersMap[e.uid] || e.uid }))
        );
      } else {
        setEntries(rawEntries);
      }

      setLoading(false);
    }
    load();
  }, [user, role, isAdmin]);

  // Personen-Filter: immer eine einzelne Person (oder "self")
  const personEntries = useMemo(() => {
    if (!isAdmin || filterUid === "self") {
      return entries.filter((e) => e.uid === user?.uid);
    }
    return entries.filter((e) => e.uid === filterUid);
  }, [entries, filterUid, isAdmin, user?.uid]);

  // Monats-Filter
  const monthEntries = useMemo(() => {
    return personEntries.filter((e) => {
      const d = e.startedAt.toDate();
      return d.getFullYear() === selectedYear && d.getMonth() === selectedMonth;
    });
  }, [personEntries, selectedYear, selectedMonth]);

  // Statistiken
  const totalMinutes = monthEntries.reduce((sum, e) => sum + e.durationMinutes, 0);
  const totalHours = Math.round((totalMinutes / 60) * 100) / 100;
  const totalEarned = monthEntries.reduce((sum, e) => sum + (e.earned || 0), 0);

  // Arbeitstage (unique Tage)
  const workDays = useMemo(() => {
    const daySet = new Set<string>();
    monthEntries.forEach((e) => {
      const d = e.startedAt.toDate();
      daySet.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    });
    return daySet.size;
  }, [monthEntries]);

  // Stundenlohn der ausgewählten Person
  const selectedRate = useMemo(() => {
    if (!isAdmin || filterUid === "self") return userRate;
    const member = teamMembers.find((m) => m.uid === filterUid);
    return member?.hourlyRate || 0;
  }, [isAdmin, filterUid, userRate, teamMembers]);

  // Ausgewählter Name
  const selectedName = useMemo(() => {
    if (!isAdmin || filterUid === "self") return "Meine";
    const member = teamMembers.find((m) => m.uid === filterUid);
    return member?.displayName || "—";
  }, [isAdmin, filterUid, teamMembers]);

  // Nach Tag gruppieren
  const entriesByDay: Record<string, (TimeEntry & { userName?: string })[]> = {};
  monthEntries.forEach((entry) => {
    const day = entry.startedAt.toDate().toLocaleDateString("de-DE", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    if (!entriesByDay[day]) entriesByDay[day] = [];
    entriesByDay[day].push(entry);
  });

  // Navigation
  const goToPrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  const goToCurrentMonth = () => {
    setSelectedYear(now.getFullYear());
    setSelectedMonth(now.getMonth());
  };

  const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();

  // Dropdown-Optionen
  const personOptions = useMemo(() => {
    const opts = [{ value: "self", label: "Meine Arbeitszeit" }];
    if (isAdmin) {
      teamMembers
        .forEach((m) => {
          if (m.uid === user?.uid) return; // eigener Eintrag ist schon "Meine Arbeitszeit"
          opts.push({ value: m.uid, label: m.displayName || m.email });
        });
    }
    return opts;
  }, [isAdmin, teamMembers, user?.uid]);

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
        <h1 className="text-2xl font-bold text-gray-900">Arbeitszeit</h1>

        {/* Personen-Dropdown (Admin) */}
        {isAdmin && (
          <div className="w-56">
            <Select
              id="person-filter"
              value={filterUid}
              onChange={(e) => setFilterUid(e.target.value)}
              options={personOptions}
            />
          </div>
        )}
      </div>

      {/* Monats-Navigation */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={goToPrevMonth}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="text-center min-w-[180px]">
            <h2 className="text-lg font-semibold text-gray-900">
              {MONTH_NAMES[selectedMonth]} {selectedYear}
            </h2>
          </div>
          <Button variant="ghost" size="sm" onClick={goToNextMonth}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
        {!isCurrentMonth && (
          <Button variant="secondary" size="sm" onClick={goToCurrentMonth}>
            Aktueller Monat
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className={`grid grid-cols-2 gap-3 mb-6 ${canViewBilling(role) || !isAdmin ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Arbeitstage</p>
              <p className="text-2xl font-bold text-gray-900">{workDays}</p>
            </div>
            <CalendarDays className="h-5 w-5 text-purple-600" />
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Stunden</p>
              <p className="text-2xl font-bold text-gray-900">{totalHours}h</p>
            </div>
            <Clock className="h-5 w-5 text-blue-600" />
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Einträge</p>
              <p className="text-2xl font-bold text-gray-900">{monthEntries.length}</p>
            </div>
            <Calendar className="h-5 w-5 text-green-600" />
          </div>
        </Card>
        {(canViewBilling(role) || !isAdmin) && (
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Verdient</p>
                <p className="text-2xl font-bold text-gray-900">{totalEarned.toFixed(2)} €</p>
              </div>
              <Euro className="h-5 w-5 text-yellow-600" />
            </div>
          </Card>
        )}
      </div>

      {/* Einträge nach Tag */}
      {Object.keys(entriesByDay).length === 0 ? (
        <div className="text-center py-12">
          <Clock className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">
            Keine Zeiteinträge{isAdmin && filterUid !== "self" ? ` für ${selectedName}` : ""} in {MONTH_NAMES[selectedMonth]} {selectedYear}.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(entriesByDay).map(([day, dayEntries]) => {
            const dayTotal = dayEntries.reduce((s, e) => s + e.durationMinutes, 0);
            const dayEarned = dayEntries.reduce((s, e) => s + (e.earned || 0), 0);

            return (
              <div key={day}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-700">{day}</h3>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>{Math.floor(dayTotal / 60)}h {dayTotal % 60}min</span>
                    {(canViewBilling(role) || !isAdmin) && (
                      <span className="font-medium text-green-600">{dayEarned.toFixed(2)} €</span>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  {dayEntries.map((entry) => {
                    const start = entry.startedAt.toDate();
                    const stop = entry.stoppedAt.toDate();
                    const hrs = Math.floor(entry.durationMinutes / 60);
                    const mins = entry.durationMinutes % 60;

                    return (
                      <Card key={entry.id} className="py-3 px-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-gray-700">
                              {start.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                              {" — "}
                              {stop.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge variant="default">
                              {hrs}h {mins}min
                            </Badge>
                            {(canViewBilling(role) || !isAdmin) && entry.earned > 0 && (
                              <Badge variant="success">
                                {entry.earned.toFixed(2)} €
                              </Badge>
                            )}
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Stundenlohn Info */}
      {(!isAdmin || filterUid === "self") && (
        <div className="mt-8 text-center text-xs text-gray-400">
          Dein Stundenlohn: {userRate > 0 ? `${userRate.toFixed(2)} €/h` : "Noch nicht festgelegt"}
        </div>
      )}
      {isAdmin && filterUid !== "self" && (
        <div className="mt-8 text-center text-xs text-gray-400">
          Stundenlohn von {selectedName}: {selectedRate > 0 ? `${selectedRate.toFixed(2)} €/h` : "Noch nicht festgelegt"}
        </div>
      )}
    </div>
  );
}
