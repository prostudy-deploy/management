"use client";

import { useState, useRef } from "react";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase/firebase";
import { TaskAttachment } from "@/lib/types";
import { Button } from "./Button";
import { Upload, X, FileText, Image, File, Loader2, Camera } from "lucide-react";

interface FileUploadProps {
  storagePath: string; // z.B. "tasks/{taskId}" oder "submissions/{subId}"
  attachments: TaskAttachment[];
  onChange: (attachments: TaskAttachment[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
}

const fileIcons: Record<string, React.ReactNode> = {
  image: <Image className="h-4 w-4 text-blue-500" />,
  pdf: <FileText className="h-4 w-4 text-red-500" />,
  default: <File className="h-4 w-4 text-gray-500" />,
};

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return fileIcons.image;
  if (ext === "pdf") return fileIcons.pdf;
  return fileIcons.default;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileUpload({
  storagePath,
  attachments,
  onChange,
  maxFiles = 10,
  maxSizeMB = 25,
}: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (attachments.length + files.length > maxFiles) {
      setError(`Maximal ${maxFiles} Dateien erlaubt.`);
      return;
    }

    setError("");
    setUploading(true);

    const newAttachments: TaskAttachment[] = [...attachments];

    for (const file of Array.from(files)) {
      if (file.size > maxSizeMB * 1024 * 1024) {
        setError(`"${file.name}" ist zu groß (max. ${maxSizeMB} MB).`);
        continue;
      }

      try {
        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const fullPath = `${storagePath}/${timestamp}_${safeName}`;
        const storageRef = ref(storage, fullPath);

        const uploadTask = uploadBytesResumable(storageRef, file);

        await new Promise<void>((resolve, reject) => {
          uploadTask.on(
            "state_changed",
            (snapshot) => {
              const pct = Math.round(
                (snapshot.bytesTransferred / snapshot.totalBytes) * 100
              );
              setProgress(pct);
            },
            (err) => reject(err),
            async () => {
              const url = await getDownloadURL(uploadTask.snapshot.ref);
              newAttachments.push({
                name: file.name,
                url,
                storagePath: fullPath,
              });
              resolve();
            }
          );
        });
      } catch (err) {
        console.error("Upload error:", err);
        setError(`Fehler beim Hochladen von "${file.name}".`);
      }
    }

    onChange(newAttachments);
    setUploading(false);
    setProgress(0);

    // Input zurücksetzen
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeAttachment = (index: number) => {
    const updated = attachments.filter((_, i) => i !== index);
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      {/* Hochgeladene Dateien */}
      {attachments.length > 0 && (
        <div className="space-y-2">
          {attachments.map((att, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
            >
              {getFileIcon(att.name)}
              <a
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-sm text-blue-600 hover:underline truncate"
              >
                {att.name}
              </a>
              <button
                type="button"
                onClick={() => removeAttachment(i)}
                className="text-gray-400 hover:text-red-500 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          id="file-upload"
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelect}
          className="hidden"
          id="camera-capture"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || attachments.length >= maxFiles}
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {progress}%
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Dateien hochladen</span>
              <span className="sm:hidden">Hochladen</span>
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => cameraRef.current?.click()}
          disabled={uploading || attachments.length >= maxFiles}
        >
          <Camera className="h-4 w-4 mr-1" />
          Foto
        </Button>
        {attachments.length > 0 && (
          <span className="text-xs text-gray-400">
            {attachments.length}/{maxFiles}
          </span>
        )}
      </div>

      {/* Fehler */}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Upload-Fortschritt */}
      {uploading && (
        <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
          <div
            className="h-full bg-blue-600 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

function isImageFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(ext);
}

function isPdfFile(name: string): boolean {
  return name.split(".").pop()?.toLowerCase() === "pdf";
}

/** Nur Anzeige von Dateien (ohne Upload/Löschen) — mit Bild- und PDF-Preview */
export function FileList({ attachments }: { attachments: TaskAttachment[] }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  if (!attachments || attachments.length === 0) return null;

  const images = attachments.filter((a) => isImageFile(a.name));
  const pdfs = attachments.filter((a) => isPdfFile(a.name));
  const others = attachments.filter((a) => !isImageFile(a.name) && !isPdfFile(a.name));

  return (
    <div className="space-y-4">
      {/* Bild-Previews als Grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {images.map((att, i) => (
            <div key={`img-${i}`} className="group relative">
              <button
                type="button"
                onClick={() => setPreviewUrl(att.url)}
                className="block w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-50 hover:border-blue-400 transition-colors"
              >
                <img
                  src={att.url}
                  alt={att.name}
                  className="w-full h-32 object-cover"
                  loading="lazy"
                />
              </button>
              <p className="mt-1 text-xs text-gray-500 truncate">{att.name}</p>
            </div>
          ))}
        </div>
      )}

      {/* PDF-Previews */}
      {pdfs.map((att, i) => (
        <div key={`pdf-${i}`} className="rounded-lg border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between bg-gray-50 px-3 py-2 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-red-500" />
              <span className="text-sm font-medium text-gray-700">{att.name}</span>
            </div>
            <a
              href={att.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline"
            >
              Öffnen ↗
            </a>
          </div>
          <iframe
            src={`${att.url}#toolbar=0`}
            className="w-full h-96 border-0"
            title={att.name}
          />
        </div>
      ))}

      {/* Andere Dateien als Liste */}
      {others.length > 0 && (
        <div className="space-y-2">
          {others.map((att, i) => (
            <a
              key={`other-${i}`}
              href={att.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 hover:bg-gray-100 transition-colors"
            >
              {getFileIcon(att.name)}
              <span className="flex-1 text-sm text-blue-600 truncate">
                {att.name}
              </span>
            </a>
          ))}
        </div>
      )}

      {/* Lightbox für Bild-Preview */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <button
              onClick={() => setPreviewUrl(null)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300"
            >
              <X className="h-6 w-6" />
            </button>
            <img
              src={previewUrl}
              alt="Vorschau"
              className="max-w-full max-h-[85vh] rounded-lg object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
