"use client";

import { useAuth } from "@/context/AuthContext";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { useEffect, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";
import { Budget } from "@/lib/types";
import { Card, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { Plus, Wallet } from "lucide-react";

export default function BudgetPage() {
  return (
    <AuthGuard>
      <BudgetContent />
    </AuthGuard>
  );
}

function BudgetContent() {
  const { role } = useAuth();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const q = query(collection(db, "budgets"), orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);
      setBudgets(
        snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Budget))
      );
      setLoading(false);
    }
    load();
  }, []);

  if (role !== "admin" && role !== "verwaltung") {
    return <p className="text-red-600">Keine Berechtigung.</p>;
  }

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
        <h1 className="text-2xl font-bold text-gray-900">Budgetplanung</h1>
        <Link href="/budget/neu">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Neues Budget
          </Button>
        </Link>
      </div>

      {budgets.length === 0 ? (
        <div className="text-center py-12">
          <Wallet className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Noch keine Budgets erstellt.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {budgets.map((budget) => {
            const percentage = budget.totalBudget > 0
              ? Math.min((budget.spent / budget.totalBudget) * 100, 100)
              : 0;
            const remaining = budget.totalBudget - budget.spent;
            const isOver = remaining < 0;

            return (
              <Card key={budget.id}>
                <CardTitle>{budget.title}</CardTitle>
                <CardContent>
                  <p className="text-xs text-gray-500 mb-3">{budget.category} - {budget.period}</p>

                  <div className="mb-2">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-500">Ausgegeben</span>
                      <span className="font-medium">
                        {budget.spent.toLocaleString("de-DE")} / {budget.totalBudget.toLocaleString("de-DE")} EUR
                      </span>
                    </div>
                    <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isOver ? "bg-red-500" : percentage > 80 ? "bg-yellow-500" : "bg-green-500"
                        }`}
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>
                  </div>

                  <p className={`text-sm font-medium ${isOver ? "text-red-600" : "text-green-600"}`}>
                    {isOver ? "Überbudget: " : "Verbleibend: "}
                    {Math.abs(remaining).toLocaleString("de-DE")} EUR
                  </p>

                  <p className="mt-2 text-xs text-gray-400">
                    {budget.entries?.length || 0} Ausgaben
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
