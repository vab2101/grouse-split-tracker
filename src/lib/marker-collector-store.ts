// IndexedDB store for marker collection data
export interface MarkerTag {
  id: string; // marker-{timestamp}
  marker: number; // 1-40
  lat: number;
  lng: number;
  elevation: number;
  accuracy: number; // meters
  timestamp: number; // ms
}

const DB_NAME = "grind-collect";
const STORE_NAME = "markers";
const DB_VERSION = 1;

let db: IDBDatabase | null = null;

async function getDb(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      db = req.result;
      resolve(db);
    };

    req.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("marker", "marker", { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });
}

export async function saveMarkerTag(tag: Omit<MarkerTag, "id">): Promise<MarkerTag> {
  const database = await getDb();
  const id = `marker-${Date.now()}`;
  const fullTag: MarkerTag = { ...tag, id };

  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    // Delete previous tag for this marker
    const markerIndex = store.index("marker");
    const range = IDBKeyRange.only(tag.marker);
    markerIndex.getAll(range).onsuccess = (event) => {
      const results = (event.target as IDBRequest).result as MarkerTag[];
      results.forEach((old) => store.delete(old.id));
    };

    // Save new tag
    const req = store.add(fullTag);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(fullTag);
  });
}

export async function getAllMarkerTags(): Promise<MarkerTag[]> {
  const database = await getDb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();

    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const results = (req.result as MarkerTag[]).sort(
        (a, b) => a.marker - b.marker
      );
      resolve(results);
    };
  });
}

export async function getMarkerTag(marker: number): Promise<MarkerTag | null> {
  const database = await getDb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, "readonly");
    const index = tx.objectStore(STORE_NAME).index("marker");
    const req = index.getAll(marker);

    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const results = (req.result as MarkerTag[]).sort(
        (a, b) => b.timestamp - a.timestamp
      );
      resolve(results[0] || null);
    };
  });
}

export async function clearAllMarkerTags(): Promise<void> {
  const database = await getDb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, "readwrite");
    const req = tx.objectStore(STORE_NAME).clear();

    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve();
  });
}
