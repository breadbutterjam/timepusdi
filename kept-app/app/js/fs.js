/* ============================================================
   fs.js — folder access (File System Access API, Chrome / Edge)
   Works on any FileSystemDirectoryHandle, so the same code can run
   against a real folder or the browser's private test folder.
   ============================================================ */

export const supported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

/** Ask the person to choose a folder. Returns null if they cancel. */
export async function pickDirectory(mode = 'read') {
  try {
    return await window.showDirectoryPicker({ mode });
  } catch (e) {
    if (e && e.name === 'AbortError') return null;
    throw e;
  }
}

export async function pickAudioFile() {
  try {
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      types: [{ description: 'Music', accept: { 'audio/*': ['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.flac', '.opus'] } }],
    });
    return await handle.getFile();
  } catch (e) {
    if (e && e.name === 'AbortError') return null;
    throw e;
  }
}

/** Every file below a folder, as {name, handle}. */
export async function* walk(dir) {
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === 'directory') yield* walk(handle);
    else yield { name, handle };
  }
}

export async function ensureDir(dir, ...names) {
  let d = dir;
  for (const n of names) d = await d.getDirectoryHandle(n, { create: true });
  return d;
}

export async function writeFile(dir, name, data) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(data);
  await w.close();
}

/** Read "photos/p0001.jpg" style relative paths. */
export async function getFileAt(dir, relPath) {
  const parts = relPath.split('/');
  let d = dir;
  for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p);
  return (await d.getFileHandle(parts[parts.length - 1])).getFile();
}

export async function removeAt(dir, relPath) {
  const parts = relPath.split('/');
  try {
    let d = dir;
    for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p);
    await d.removeEntry(parts[parts.length - 1]);
  } catch {
    /* already gone */
  }
}

export const chapterDirName = (n) => 'Chapter-' + String(n).padStart(2, '0');

/** Chapter folders in book order: Chapter-01, Chapter-02, … */
export async function chapterDirNames(root) {
  const names = [];
  for await (const [name, handle] of root.entries()) {
    if (handle.kind === 'directory' && /^Chapter-\d+$/.test(name)) names.push(name);
  }
  return names.sort((a, b) => parseInt(a.slice(8), 10) - parseInt(b.slice(8), 10));
}

/* ---- Remember the last book so reopening is one click (permission is re-asked by the browser) ---- */
const DB = 'kept';
const open = () =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('handles');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export async function rememberAlbum(handle) {
  try {
    const db = await open();
    await new Promise((res, rej) => {
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').put(handle, 'lastAlbum');
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  } catch {
    /* remembering is a convenience only */
  }
}

export async function recallAlbum() {
  try {
    const db = await open();
    return await new Promise((res, rej) => {
      const req = db.transaction('handles').objectStore('handles').get('lastAlbum');
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => rej(req.error);
    });
  } catch {
    return null;
  }
}

export async function ensurePermission(handle, mode = 'readwrite') {
  if ((await handle.queryPermission({ mode })) === 'granted') return true;
  return (await handle.requestPermission({ mode })) === 'granted';
}
