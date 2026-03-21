import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { GoogleGenerativeAI } from "@google/generative-ai";

admin.initializeApp();
const db = admin.firestore();

const geminiApiKey = defineSecret("GEMINI_API_KEY");

/**
 * Cloud Function: Wird automatisch getriggert wenn eine neue Abgabe (Submission) erstellt wird.
 * Sendet die Aufgabenbeschreibung + Abgabe an Gemini und speichert das Feedback.
 */
export const analyzeSubmission = onDocumentCreated(
  {
    document: "submissions/{submissionId}",
    secrets: [geminiApiKey],
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const submission = snapshot.data();
    const submissionId = event.params.submissionId;
    const taskId = submission.taskId;

    try {
      // Aufgabe laden
      const taskDoc = await db.collection("tasks").doc(taskId).get();
      if (!taskDoc.exists) {
        console.error("Task nicht gefunden:", taskId);
        return;
      }
      const task = taskDoc.data()!;

      // Gemini initialisieren
      const genAI = new GoogleGenerativeAI(geminiApiKey.value());
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const prompt = `Du bist ein KI-Assistent für ein Team-Management-Tool.
Analysiere die folgende Abgabe eines Mitarbeiters zu einer Aufgabe.

AUFGABE:
Titel: ${task.title}
Beschreibung: ${task.description}
Kategorie: ${task.category || "Allgemein"}

ABGABE DES MITARBEITERS:
${submission.content}

Antworte AUF DEUTSCH im folgenden JSON-Format (nur das JSON, kein Markdown):
{
  "summary": "Kurze Zusammenfassung der Abgabe (2-3 Sätze)",
  "strengths": ["Stärke 1", "Stärke 2"],
  "improvements": ["Verbesserungsvorschlag 1", "Verbesserungsvorschlag 2"],
  "score": <Zahl von 1-10>
}`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();

      // JSON aus der Antwort extrahieren
      let feedback;
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          feedback = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("Kein JSON in Antwort gefunden");
        }
      } catch {
        console.error("Gemini Antwort konnte nicht geparst werden:", responseText);
        feedback = {
          summary: "KI-Analyse konnte nicht verarbeitet werden.",
          strengths: [],
          improvements: [],
          score: null,
        };
      }

      // Feedback in Submission speichern
      await snapshot.ref.update({
        aiFeedback: {
          summary: feedback.summary || "",
          strengths: feedback.strengths || [],
          improvements: feedback.improvements || [],
          score: feedback.score || null,
          generatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        aiStatus: "completed",
      });

      // Task-Status auf under_review setzen
      await db.collection("tasks").doc(taskId).update({
        status: "under_review",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`KI-Feedback für Submission ${submissionId} erfolgreich generiert.`);
    } catch (error) {
      console.error("Fehler bei KI-Analyse:", error);

      // Fehlerstatus setzen
      await snapshot.ref.update({
        aiStatus: "error",
      });
    }
  }
);
