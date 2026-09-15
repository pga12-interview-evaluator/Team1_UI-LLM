export interface SavedRecording {
  id: string;
  title: string;
  createdAt: string;
  durationSeconds: number;
  blob: Blob;
}
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("interviewly-recordings", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("recordings", { keyPath: "id" });
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}
export async function saveRecording(recording: SavedRecording): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("recordings", "readwrite");
      tx.objectStore("recordings").put(recording);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function listRecordings(): Promise<SavedRecording[]> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction("recordings").objectStore("recordings").getAll();
      req.onsuccess = () =>
        resolve(
          (req.result as SavedRecording[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        );
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
export async function deleteRecording(id: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("recordings", "readwrite");
      tx.objectStore("recordings").delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export function recordingFilename(recording: SavedRecording) {
  return `interview-${recording.createdAt.slice(0, 10)}-${recording.id.slice(0, 8)}.${recording.blob.type.includes("mp4") ? "mp4" : "webm"}`;
}
