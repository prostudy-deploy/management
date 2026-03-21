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
import { ChatMessage, ChatMention, ChatGroup, TaskAttachment, AppUser, Task, Submission, canManageTasks } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";

// Datei-Info für Mention-System
interface FileInfo {
  name: string;
  url: string;
  taskId: string;
  taskTitle: string;
  source: "task" | "submission";
}
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
  Plus,
  Hash,
  Users,
  ChevronLeft,
  Settings,
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

  const parts: React.ReactNode[] = [];
  let remaining = content;
  let key = 0;

  mentions.forEach((mention) => {
    const tag = `@${mention.label}`;
    const idx = remaining.indexOf(tag);
    if (idx === -1) return;

    if (idx > 0) {
      parts.push(<span key={key++} className="whitespace-pre-wrap">{remaining.slice(0, idx)}</span>);
    }

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
    } else if (mention.type === "file") {
      parts.push(
        <a
          key={key++}
          href={mention.url || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded bg-green-100 px-1.5 py-0.5 text-sm font-medium text-green-700 hover:bg-green-200 transition-colors"
        >
          <FileText className="h-3 w-3" />
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

  // Gruppen
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string>("allgemein");
  const [showGroupSidebar, setShowGroupSidebar] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [newGroupMembers, setNewGroupMembers] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  // @-Mention State
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionType, setMentionType] = useState<"all" | "task" | "user" | "file">("all");
  const [pendingMentions, setPendingMentions] = useState<ChatMention[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);

  // Daten für @-Mentions
  const [teamMembers, setTeamMembers] = useState<AppUser[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allFiles, setAllFiles] = useState<FileInfo[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const isManager = canManageTasks(role);

  // Team + Aufgaben + Dateien laden
  useEffect(() => {
    async function loadData() {
      const usersSnap = await getDocs(collection(db, "users"));
      setTeamMembers(usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser)));

      const tasksSnap = await getDocs(
        query(collection(db, "tasks"), orderBy("createdAt", "desc"), limit(100))
      );
      const loadedTasks = tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Task));
      setTasks(loadedTasks);

      // Dateien aus Aufgaben sammeln
      const files: FileInfo[] = [];
      loadedTasks.forEach((task) => {
        if (task.attachments?.length > 0) {
          task.attachments.forEach((att) => {
            files.push({
              name: att.name,
              url: att.url,
              taskId: task.id,
              taskTitle: task.title,
              source: "task",
            });
          });
        }
      });

      // Dateien aus Abgaben sammeln
      if (isManager) {
        const subsSnap = await getDocs(collection(db, "submissions"));
        subsSnap.docs.forEach((d) => {
          const sub = d.data() as Submission;
          const task = loadedTasks.find((t) => t.id === sub.taskId);
          if (sub.attachments?.length > 0) {
            sub.attachments.forEach((att) => {
              files.push({
                name: att.name,
                url: att.url,
                taskId: sub.taskId,
                taskTitle: task?.title || "Unbekannte Aufgabe",
                source: "submission",
              });
            });
          }
        });
      }

      setAllFiles(files);
    }
    loadData();
  }, [isManager]);

  // Gruppen laden (Echtzeit)
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "chatGroups"), orderBy("createdAt", "asc")),
      (snapshot) => {
        const loaded = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as ChatGroup));
        setGroups(loaded);
      }
    );
    return () => unsub();
  }, []);

  // Nachrichten für aktive Gruppe (Echtzeit)
  useEffect(() => {
    const q = query(
      collection(db, "chatMessages"),
      where("groupId", "==", activeGroupId),
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
  }, [activeGroupId]);

  // Auto-Scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Sichtbare Gruppen (nur wo User Mitglied ist oder alle)
  const visibleGroups = useMemo(() => {
    if (!user) return [];
    return groups.filter(
      (g) => g.members.length === 0 || g.members.includes(user.uid)
    );
  }, [groups, user]);

  const activeGroup = useMemo(() => {
    return groups.find((g) => g.id === activeGroupId);
  }, [groups, activeGroupId]);

  // @-Mention Vorschläge
  const mentionSuggestions = useMemo(() => {
    if (!showMentions) return [];
    const q = mentionQuery.toLowerCase();
    const results: { type: "task" | "user" | "file"; id: string; label: string; sub?: string; url?: string }[] = [];

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

    if (mentionType === "file") {
      // Dateien nur im "Dateien"-Tab anzeigen (mit Suchfeld)
      allFiles
        .filter((f) => f.name.toLowerCase().includes(q) || f.taskTitle.toLowerCase().includes(q))
        .slice(0, 10)
        .forEach((f) => results.push({
          type: "file",
          id: f.url,
          label: f.name,
          sub: `${f.source === "task" ? "Aufgabe" : "Abgabe"}: ${f.taskTitle}`,
          url: f.url,
        }));
    }

    return results;
  }, [showMentions, mentionQuery, mentionType, teamMembers, tasks, allFiles]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);

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

  const selectMention = useCallback(
    (suggestion: { type: "task" | "user" | "file"; id: string; label: string; url?: string }) => {
      const cursorPos = inputRef.current?.selectionStart || 0;
      const textBeforeCursor = input.slice(0, cursorPos);
      const atIdx = textBeforeCursor.lastIndexOf("@");
      const before = input.slice(0, atIdx);
      const after = input.slice(cursorPos);

      const displayLabel = suggestion.type === "file"
        ? `📎${suggestion.label}`
        : suggestion.label;

      setInput(`${before}@${displayLabel} ${after}`);
      setPendingMentions([
        ...pendingMentions,
        {
          type: suggestion.type,
          id: suggestion.id,
          label: displayLabel,
          ...(suggestion.type === "file" ? { url: suggestion.url } : {}),
        },
      ]);
      setShowMentions(false);

      setTimeout(() => inputRef.current?.focus(), 0);
    },
    [input, pendingMentions]
  );

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
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  // Nachricht senden
  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || !user || sending) return;

    setSending(true);
    try {
      await addDoc(collection(db, "chatMessages"), {
        uid: user.uid,
        groupId: activeGroupId,
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

  // Gruppe erstellen
  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || !user) return;
    setCreatingGroup(true);

    try {
      await addDoc(collection(db, "chatGroups"), {
        name: newGroupName.trim(),
        description: newGroupDesc.trim(),
        createdBy: user.uid,
        members: newGroupMembers, // leer = alle
        createdAt: Timestamp.now(),
      });

      setNewGroupName("");
      setNewGroupDesc("");
      setNewGroupMembers([]);
      setShowCreateGroup(false);
    } catch (err) {
      console.error("Create group error:", err);
    } finally {
      setCreatingGroup(false);
    }
  };

  const switchGroup = (groupId: string) => {
    setActiveGroupId(groupId);
    setShowGroupSidebar(false);
  };

  return (
    <div className="flex h-[calc(100vh-5rem)] lg:h-[calc(100vh-4rem)]">
      {/* Gruppen-Sidebar Desktop */}
      <div className="hidden sm:flex w-56 flex-col border-r border-gray-200 bg-white shrink-0">
        <div className="flex items-center justify-between px-3 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-700">Gruppen</h2>
          {isManager && (
            <button
              onClick={() => setShowCreateGroup(true)}
              className="rounded-md p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              title="Neue Gruppe"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {/* Allgemein (Standard) */}
          <button
            onClick={() => switchGroup("allgemein")}
            className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${
              activeGroupId === "allgemein"
                ? "bg-blue-50 text-blue-700 font-medium"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Hash className="h-4 w-4 shrink-0" />
            <span className="truncate">Allgemein</span>
          </button>

          {visibleGroups.map((group) => (
            <button
              key={group.id}
              onClick={() => switchGroup(group.id)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${
                activeGroupId === group.id
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {group.members.length > 0 ? (
                <Users className="h-4 w-4 shrink-0" />
              ) : (
                <Hash className="h-4 w-4 shrink-0" />
              )}
              <span className="truncate">{group.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Mobile Gruppen-Overlay */}
      {showGroupSidebar && (
        <div className="fixed inset-0 z-50 sm:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowGroupSidebar(false)} />
          <div className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Gruppen</h2>
              <div className="flex items-center gap-2">
                {isManager && (
                  <button
                    onClick={() => { setShowCreateGroup(true); setShowGroupSidebar(false); }}
                    className="rounded-md p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                )}
                <button
                  onClick={() => setShowGroupSidebar(false)}
                  className="rounded-md p-1.5 text-gray-400 hover:text-gray-900"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto py-1">
              <button
                onClick={() => switchGroup("allgemein")}
                className={`flex w-full items-center gap-3 px-4 py-3 text-sm transition-colors ${
                  activeGroupId === "allgemein"
                    ? "bg-blue-50 text-blue-700 font-medium"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Hash className="h-5 w-5 shrink-0" />
                <div className="text-left">
                  <p>Allgemein</p>
                  <p className="text-xs text-gray-400">Alle Mitglieder</p>
                </div>
              </button>

              {visibleGroups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => switchGroup(group.id)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-sm transition-colors ${
                    activeGroupId === group.id
                      ? "bg-blue-50 text-blue-700 font-medium"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {group.members.length > 0 ? (
                    <Users className="h-5 w-5 shrink-0" />
                  ) : (
                    <Hash className="h-5 w-5 shrink-0" />
                  )}
                  <div className="text-left">
                    <p>{group.name}</p>
                    {group.description && (
                      <p className="text-xs text-gray-400 truncate">{group.description}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Chat-Bereich */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-200 pb-2 mb-2 sm:pb-3 sm:mb-3 shrink-0">
          {/* Mobile: Gruppen-Button */}
          <button
            onClick={() => setShowGroupSidebar(true)}
            className="sm:hidden p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
          >
            <Users className="h-5 w-5" />
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Hash className="h-5 w-5 text-gray-400 hidden sm:block" />
              {activeGroupId === "allgemein" ? "Allgemein" : activeGroup?.name || "Chat"}
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 truncate">
              {activeGroupId === "allgemein"
                ? `${teamMembers.length} Mitglieder`
                : activeGroup?.description || `${activeGroup?.members.length === 0 ? "Alle" : activeGroup?.members.length} Mitglieder`
              }
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className="inline-block h-2 w-2 rounded-full bg-green-400" />
            <span className="hidden sm:inline">Live</span>
          </div>
        </div>

        {/* Nachrichten-Bereich */}
        <div className="flex-1 overflow-y-auto space-y-1 pr-2 min-h-0">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <Hash className="h-12 w-12 mb-3" />
              <p className="text-lg font-medium">Noch keine Nachrichten</p>
              <p className="text-sm text-center px-4">
                Starte die Konversation in <strong>#{activeGroupId === "allgemein" ? "Allgemein" : activeGroup?.name}</strong>
              </p>
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

                  <div className="ml-9">
                    {msg.content && (
                      <div className="text-sm text-gray-800 leading-relaxed">
                        {renderMessageContent(msg.content, msg.mentions)}
                      </div>
                    )}

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
        {showMentions && (mentionSuggestions.length > 0 || mentionType === "file") && (
          <div className="relative shrink-0">
            <div className="absolute bottom-0 left-0 right-0 z-10 mb-1 rounded-lg border border-gray-200 bg-white shadow-lg max-h-72 overflow-hidden flex flex-col">
              {/* Tabs */}
              <div className="flex border-b border-gray-100 px-2 pt-2 gap-1 shrink-0">
                {(["all", "user", "task", "file"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => { setMentionType(type); setMentionIndex(0); }}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                      mentionType === type ? "bg-blue-100 text-blue-700" : "text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    {type === "all" ? "Alle" : type === "user" ? "Personen" : type === "task" ? "Aufgaben" : "📎 Dateien"}
                  </button>
                ))}
              </div>

              {/* Datei-Tab: Hinweis wenn leer */}
              {mentionType === "file" && mentionSuggestions.length === 0 && (
                <div className="px-3 py-4 text-center text-sm text-gray-400">
                  <Paperclip className="h-6 w-6 mx-auto mb-2 text-gray-300" />
                  <p>Dateiname oder Aufgabe eingeben</p>
                  <p className="text-xs mt-1">{allFiles.length} Dateien verfügbar</p>
                </div>
              )}

              {/* Ergebnisliste */}
              <div className="py-1 overflow-y-auto">
                {mentionSuggestions.map((s, i) => (
                  <button
                    key={`${s.type}-${s.id}-${i}`}
                    onClick={() => selectMention(s)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors ${
                      i === mentionIndex ? "bg-blue-50" : ""
                    }`}
                  >
                    {s.type === "user" ? (
                      <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${getAvatarColor(s.id)}`}>
                        {getInitials(s.label)}
                      </div>
                    ) : s.type === "file" ? (
                      <div className="h-6 w-6 rounded flex items-center justify-center bg-green-100 shrink-0">
                        {isImageFile(s.label) ? (
                          <ImageIcon className="h-3.5 w-3.5 text-green-600" />
                        ) : (
                          <FileText className="h-3.5 w-3.5 text-green-600" />
                        )}
                      </div>
                    ) : (
                      <ClipboardList className="h-5 w-5 text-blue-500 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{s.label}</p>
                      {s.sub && (
                        <p className="text-xs text-gray-400 truncate">{s.sub}</p>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">
                      {s.type === "user" ? "Person" : s.type === "task" ? "Aufgabe" : "Datei"}
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
                placeholder={`Nachricht in #${activeGroupId === "allgemein" ? "Allgemein" : activeGroup?.name || "Chat"}...`}
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
      </div>

      {/* Gruppe erstellen Modal */}
      {showCreateGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Neue Gruppe erstellen</h2>

            <div className="space-y-4">
              <Input
                id="groupName"
                label="Gruppenname"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="z.B. Marketing-Team"
                required
              />

              <Input
                id="groupDesc"
                label="Beschreibung (optional)"
                value={newGroupDesc}
                onChange={(e) => setNewGroupDesc(e.target.value)}
                placeholder="Worum geht es in dieser Gruppe?"
              />

              {/* Mitglieder auswählen */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Mitglieder
                </label>
                <p className="text-xs text-gray-400 mb-2">
                  Keine Auswahl = alle Mitglieder haben Zugang
                </p>
                <div className="space-y-1 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2">
                  {teamMembers.map((member) => (
                    <label
                      key={member.uid}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={newGroupMembers.includes(member.uid)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewGroupMembers([...newGroupMembers, member.uid]);
                          } else {
                            setNewGroupMembers(newGroupMembers.filter((id) => id !== member.uid));
                          }
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div
                        className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${getAvatarColor(member.uid)}`}
                      >
                        {getInitials(member.displayName)}
                      </div>
                      <span className="text-sm text-gray-700">{member.displayName}</span>
                      <span className="text-xs text-gray-400 capitalize ml-auto">{member.role}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button
                onClick={handleCreateGroup}
                disabled={!newGroupName.trim() || creatingGroup}
              >
                {creatingGroup ? "Wird erstellt..." : "Gruppe erstellen"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowCreateGroup(false);
                  setNewGroupName("");
                  setNewGroupDesc("");
                  setNewGroupMembers([]);
                }}
              >
                Abbrechen
              </Button>
            </div>
          </div>
        </div>
      )}

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
