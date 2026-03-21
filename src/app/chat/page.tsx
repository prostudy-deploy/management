"use client";

import { useAuth } from "@/context/AuthContext";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  onSnapshot,
  Timestamp,
  limit,
  where,
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase/firebase";
import { ChatMessage, ChatMention, TaskAttachment, AppUser, Task } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  Send,
  Paperclip,
  Image as ImageIcon,
  FileText,
  File,
  X,
  ClipboardList,
  User,
  AtSign,
  Loader2,
  Camera,
} from "lucide-react";

export default function ChatPage() {
  return (
    <AuthGuard>
      <ChatContent />
    </AuthGuard>
  );
}

// --- Hilfsfunktionen ---
function isImageFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(ext);
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (isImageFile(name)) return <ImageIcon className="h-4 w-4 text-blue-500" />;
  if (ext === "pdf") return <FileText className="h-4 w-4 text-red-500" />;
  return <File className="h-4 w-4 text-gray-500" />;
}

// Farben für User-Avatare
const AVATAR_COLORS = [
  "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500",
  "bg-pink-500", "bg-cyan-500", "bg-yellow-500", "bg-red-500",
];

function getAvatarColor(uid: string) {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) hash = uid.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// --- Nachrichten-Rendering mit Mentions ---
function renderMessageContent(content: string, mentions: ChatMention[]) {
  if (!mentions || mentions.length === 0) {
    return <span className="whitespace-pre-wrap">{content}</span>;
  }

  // @mentions im Text finden und durch Links ersetzen
  const parts: React.ReactNode[] = [];
  let remaining = content;
  let key = 0;

  mentions.forEach((mention) => {
    const tag = `@${mention.label}`;
    const idx = remaining.indexOf(tag);
    if (idx === -1) return;

    // Text vor dem Mention
    if (idx > 0) {
      parts.push(<span key={key++} className="whitespace-pre-wrap">{remaining.slice(0, idx)}</span>);
    }

    // Mention als klickbarer Link
    if (mention.type === "task") {
      parts.push(
        <a
          key={key++}
          href={`/aufgaben/${mention.id}`}
          className="inline-flex items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-sm font-medium text-blue-700 hover:bg-blue-200 transition-colors"
        >
          <ClipboardList className="h-3 w-3" />
          {mention.label}
        </a>
      );
    } else {
      parts.push(
        <span
          key={key++}
          className="inline-flex items-center gap-1 rounded bg-purple-100 px-1.5 py-0.5 text-sm font-medium text-purple-700"
        >
          <User className="h-3 w-3" />
          {mention.label}
        </span>
      );
    }

    remaining = remaining.slice(idx + tag.length);
  });

  if (remaining) {
    parts.push(<span key={key++} className="whitespace-pre-wrap">{remaining}</span>);
  }

  return <>{parts}</>;
}

// --- Hauptkomponente ---
function ChatContent() {
  const { user, role, displayName } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // @-Mention State
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionType, setMentionType] = useState<"all" | "task" | "user">("all");
  const [pendingMentions, setPendingMentions] = useState<ChatMention[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);

  // Daten für @-Mentions
  const [teamMembers, setTeamMembers] = useState<AppUser[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Team + Aufgaben laden
  useEffect(() => {
    async function loadData() {
      const usersSnap = await getDocs(collection(db, "users"));
      setTeamMembers(usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser)));

      const tasksSnap = await getDocs(
        query(collection(db, "tasks"), orderBy("createdAt", "desc"), limit(100))
      );
      setTasks(tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Task)));
    }
    loadData();
  }, []);

  // Echtzeit-Nachrichten mit onSnapshot
  useEffect(() => {
    const q = query(
      collection(db, "chatMessages"),
      orderBy("createdAt", "asc"),
      limit(200)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as ChatMessage[];
      setMessages(msgs);
    });

    return () => unsub();
  }, []);

  // Auto-Scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // @-Mention Vorschläge
  const mentionSuggestions = useMemo(() => {
    if (!showMentions) return [];
    const q = mentionQuery.toLowerCase();
    const results: { type: "task" | "user"; id: string; label: string; sub?: string }[] = [];

    if (mentionType === "all" || mentionType === "user") {
      teamMembers
        .filter((m) => m.displayName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
        .slice(0, 5)
        .forEach((m) => results.push({ type: "user", id: m.uid, label: m.displayName, sub: m.role }));
    }

    if (mentionType === "all" || mentionType === "task") {
      tasks
        .filter((t) => t.title.toLowerCase().includes(q))
        .slice(0, 5)
        .forEach((t) => results.push({ type: "task", id: t.id, label: t.title, sub: t.status }));
    }

    return results;
  }, [showMentions, mentionQuery, mentionType, teamMembers, tasks]);

  // Input-Handler mit @-Mention Detection
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);

    // Check if @ was typed
    const cursorPos = e.target.selectionStart || 0;
    const textBeforeCursor = val.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\S*)$/);

    if (atMatch) {
      setShowMentions(true);
      setMentionQuery(atMatch[1]);
      setMentionIndex(0);
    } else {
      setShowMentions(false);
    }
  };

  // Mention auswählen
  const selectMention = useCallback(
    (suggestion: { type: "task" | "user"; id: string; label: string }) => {
      const cursorPos = inputRef.current?.selectionStart || 0;
      const textBeforeCursor = input.slice(0, cursorPos);
      const atIdx = textBeforeCursor.lastIndexOf("@");
      const before = input.slice(0, atIdx);
      const after = input.slice(cursorPos);

      setInput(`${before}@${suggestion.label} ${after}`);
      setPendingMentions([
        ...pendingMentions,
        { type: suggestion.type, id: suggestion.id, label: suggestion.label },
      ]);
      setShowMentions(false);

      setTimeout(() => inputRef.current?.focus(), 0);
    },
    [input, pendingMentions]
  );

  // Tastatur-Navigation in Mentions
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showMentions && mentionSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((prev) => Math.min(prev + 1, mentionSuggestions.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectMention(mentionSuggestions[mentionIndex]);
      } else if (e.key === "Escape") {
        setShowMentions(false);
      }
      return;
    }

    // Shift+Enter für neue Zeile, Enter zum Senden
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Datei-Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !user) return;

    setUploading(true);
    const newAttachments: TaskAttachment[] = [...attachments];

    for (const file of Array.from(files)) {
      if (file.size > 25 * 1024 * 1024) continue;

      try {
        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const fullPath = `chat/${user.uid}/${timestamp}_${safeName}`;
        const storageRef = ref(storage, fullPath);
        const uploadTask = uploadBytesResumable(storageRef, file);

        await new Promise<void>((resolve, reject) => {
          uploadTask.on(
            "state_changed",
            (snap) => setUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
            reject,
            async () => {
              const url = await getDownloadURL(uploadTask.snapshot.ref);
              newAttachments.push({ name: file.name, url, storagePath: fullPath });
              resolve();
            }
          );
        });
      } catch (err) {
        console.error("Upload error:", err);
      }
    }

    setAttachments(newAttachments);
    setUploading(false);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Nachricht senden
  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || !user || sending) return;

    setSending(true);
    try {
      await addDoc(collection(db, "chatMessages"), {
        uid: user.uid,
        displayName: displayName || user.email,
        content: input.trim(),
        attachments,
        mentions: pendingMentions,
        createdAt: Timestamp.now(),
      });

      setInput("");
      setAttachments([]);
      setPendingMentions([]);
    } catch (err) {
      console.error("Send error:", err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] lg:h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-2 sm:pb-3 sm:mb-3 shrink-0">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-gray-900">Team-Chat</h1>
          <p className="text-xs sm:text-sm text-gray-500">{teamMembers.length} Mitglieder</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="inline-block h-2 w-2 rounded-full bg-green-400" />
          Live
        </div>
      </div>

      {/* Nachrichten-Bereich */}
      <div className="flex-1 overflow-y-auto space-y-1 pr-2 min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <AtSign className="h-12 w-12 mb-3" />
            <p className="text-lg font-medium">Noch keine Nachrichten</p>
            <p className="text-sm">Starte die Konversation! Nutze @aufgabe oder @person um Dinge zu verlinken.</p>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isOwn = msg.uid === user?.uid;
            const prevMsg = i > 0 ? messages[i - 1] : null;
            const sameSender = prevMsg?.uid === msg.uid;
            const msgTime = msg.createdAt?.toDate();
            const prevTime = prevMsg?.createdAt?.toDate();
            const timeDiff = msgTime && prevTime ? (msgTime.getTime() - prevTime.getTime()) / 60000 : 999;
            const showHeader = !sameSender || timeDiff > 5;

            return (
              <div key={msg.id} className={`${showHeader ? "mt-4" : "mt-0.5"}`}>
                {showHeader && (
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${getAvatarColor(msg.uid)}`}
                    >
                      {getInitials(msg.displayName || "?")}
                    </div>
                    <span className="text-sm font-semibold text-gray-900">
                      {msg.displayName}
                    </span>
                    <span className="text-xs text-gray-400">
                      {msgTime?.toLocaleString("de-DE", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                )}

                <div className={`${showHeader ? "ml-9" : "ml-9"}`}>
                  {/* Text */}
                  {msg.content && (
                    <div className="text-sm text-gray-800 leading-relaxed">
                      {renderMessageContent(msg.content, msg.mentions)}
                    </div>
                  )}

                  {/* Bild-Attachments inline */}
                  {msg.attachments?.filter((a) => isImageFile(a.name)).length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {msg.attachments
                        .filter((a) => isImageFile(a.name))
                        .map((att, j) => (
                          <button
                            key={j}
                            onClick={() => setPreviewImage(att.url)}
                            className="block overflow-hidden rounded-lg border border-gray-200 hover:border-blue-400 transition-colors"
                          >
                            <img
                              src={att.url}
                              alt={att.name}
                              className="max-w-[200px] sm:max-w-xs max-h-40 sm:max-h-48 object-cover"
                              loading="lazy"
                            />
                          </button>
                        ))}
                    </div>
                  )}

                  {/* Nicht-Bild-Attachments */}
                  {msg.attachments?.filter((a) => !isImageFile(a.name)).length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {msg.attachments
                        .filter((a) => !isImageFile(a.name))
                        .map((att, j) => (
                          <a
                            key={j}
                            href={att.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm hover:bg-gray-100 transition-colors"
                          >
                            {getFileIcon(att.name)}
                            <span className="text-blue-600 truncate max-w-[200px]">{att.name}</span>
                          </a>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Anhang-Vorschau */}
      {attachments.length > 0 && (
        <div className="border-t border-gray-200 pt-2 px-1 shrink-0">
          <div className="flex flex-wrap gap-2">
            {attachments.map((att, i) => (
              <div key={i} className="relative group">
                {isImageFile(att.name) ? (
                  <img src={att.url} alt={att.name} className="h-16 w-16 rounded-lg object-cover border border-gray-200" />
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs">
                    {getFileIcon(att.name)}
                    <span className="truncate max-w-[120px]">{att.name}</span>
                  </div>
                )}
                <button
                  onClick={() => setAttachments(attachments.filter((_, j) => j !== i))}
                  className="absolute -top-1 -right-1 rounded-full bg-red-500 text-white p-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload-Fortschritt */}
      {uploading && (
        <div className="px-1 shrink-0">
          <div className="h-1 rounded-full bg-gray-200 overflow-hidden">
            <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}

      {/* @-Mention Dropdown */}
      {showMentions && mentionSuggestions.length > 0 && (
        <div className="relative shrink-0">
          <div className="absolute bottom-0 left-0 right-0 z-10 mb-1 rounded-lg border border-gray-200 bg-white shadow-lg max-h-60 overflow-y-auto">
            {/* Tabs */}
            <div className="flex border-b border-gray-100 px-2 pt-2 gap-1">
              {(["all", "user", "task"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => { setMentionType(type); setMentionIndex(0); }}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                    mentionType === type ? "bg-blue-100 text-blue-700" : "text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  {type === "all" ? "Alle" : type === "user" ? "Personen" : "Aufgaben"}
                </button>
              ))}
            </div>

            <div className="py-1">
              {mentionSuggestions.map((s, i) => (
                <button
                  key={`${s.type}-${s.id}`}
                  onClick={() => selectMention(s)}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors ${
                    i === mentionIndex ? "bg-blue-50" : ""
                  }`}
                >
                  {s.type === "user" ? (
                    <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${getAvatarColor(s.id)}`}>
                      {getInitials(s.label)}
                    </div>
                  ) : (
                    <ClipboardList className="h-5 w-5 text-blue-500" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{s.label}</p>
                    {s.sub && (
                      <p className="text-xs text-gray-400 capitalize">{s.sub}</p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">
                    {s.type === "user" ? "Person" : "Aufgabe"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Eingabe */}
      <div className="border-t border-gray-200 pt-2 sm:pt-3 shrink-0">
        <div className="flex items-end gap-1 sm:gap-2">
          {/* Hidden file inputs */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileUpload}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileUpload}
          />

          {/* Kamera-Button (immer sichtbar, öffnet Kamera auf Mobile) */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => cameraInputRef.current?.click()}
            disabled={uploading}
            className="shrink-0"
            title="Foto aufnehmen"
          >
            <Camera className="h-5 w-5" />
          </Button>

          {/* Datei-Button */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="shrink-0"
            title="Datei hochladen"
          >
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
          </Button>

          <div className="relative flex-1 min-w-0">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Nachricht... (@ für Mentions)"
              className="w-full resize-none rounded-xl border border-gray-300 bg-white px-3 sm:px-4 py-2 sm:py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none max-h-32"
              rows={1}
              style={{ minHeight: "40px" }}
              onInput={(e) => {
                const el = e.target as HTMLTextAreaElement;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 128) + "px";
              }}
            />
          </div>

          <Button
            type="button"
            onClick={handleSend}
            disabled={sending || (!input.trim() && attachments.length === 0)}
            className="rounded-xl shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>

        <p className="mt-1 text-xs text-gray-400 text-center hidden sm:block">
          <kbd className="rounded bg-gray-100 px-1 py-0.5 text-[10px]">Enter</kbd> Senden · <kbd className="rounded bg-gray-100 px-1 py-0.5 text-[10px]">Shift+Enter</kbd> Neue Zeile · <kbd className="rounded bg-gray-100 px-1 py-0.5 text-[10px]">@</kbd> Aufgabe/Person verlinken
        </p>
      </div>

      {/* Lightbox */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300"
            >
              <X className="h-6 w-6" />
            </button>
            <img
              src={previewImage}
              alt="Vorschau"
              className="max-w-full max-h-[85vh] rounded-lg object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
