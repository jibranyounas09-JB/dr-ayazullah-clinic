export interface DocumentReference {
  type: 'document';
  collection: string;
  id: string;
}

export interface CollectionReference {
  type: 'collection';
  path: string;
}

export interface QueryConstraint {
  type: 'where' | 'orderBy';
  field: string;
  op?: string;
  val?: any;
  direction?: 'asc' | 'desc';
}

export interface Query {
  collection: string;
  constraints: QueryConstraint[];
}

export interface DocumentSnapshot {
  id: string;
  exists: () => boolean;
  data: () => any;
}

export interface QueryDocumentSnapshot extends DocumentSnapshot {}

export interface QuerySnapshot {
  empty: boolean;
  size: number;
  docs: QueryDocumentSnapshot[];
}

export function getFirestore(app?: any, dbId?: string) {
  return { type: 'neon_firestore', dbId };
}

export function collection(dbOrParent: any, path: string): CollectionReference {
  return { type: 'collection', path };
}

export function generateDocId(prefix: string = 'doc'): string {
  const cleanPrefix = (prefix || 'doc').replace(/[^a-zA-Z0-9]/g, '').slice(0, 4) || 'doc';
  return `${cleanPrefix}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

export function doc(dbOrColl: any, ...pathSegments: string[]): DocumentReference {
  // Case 1: doc(collectionRef) or doc(collectionRef, "docId")
  if (dbOrColl && dbOrColl.type === 'collection') {
    const collName = dbOrColl.path || 'general';
    const docId = (pathSegments.length > 0 && pathSegments[0]) ? pathSegments[0] : generateDocId(collName);
    return { type: 'document', collection: collName, id: docId };
  }

  // Case 2: doc(db, "collection", "docId")
  if (pathSegments.length >= 2) {
    return { type: 'document', collection: pathSegments[0], id: pathSegments[1] };
  }

  // Case 3: doc(db, "collection/docId")
  if (pathSegments.length === 1 && pathSegments[0].includes('/')) {
    const parts = pathSegments[0].split('/').filter(Boolean);
    const coll = parts[0] || 'general';
    const id = parts[1] || generateDocId(coll);
    return { type: 'document', collection: coll, id };
  }

  // Case 4: doc(db, "collection")
  if (pathSegments.length === 1 && pathSegments[0]) {
    return { type: 'document', collection: pathSegments[0], id: generateDocId(pathSegments[0]) };
  }

  return { type: 'document', collection: 'general', id: generateDocId('gen') };
}

export function where(field: string, op: string, val: any): QueryConstraint {
  return { type: 'where', field, op, val };
}

export function orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): QueryConstraint {
  return { type: 'orderBy', field, direction };
}

export function query(coll: CollectionReference, ...constraints: QueryConstraint[]): Query {
  return {
    collection: coll.path,
    constraints
  };
}

export function serverTimestamp() {
  return new Date().toISOString();
}

async function fetchNeon(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Neon API Error (${res.status}): ${text}`);
  }
  return res.json();
}

export async function getDoc(docRef: DocumentReference): Promise<DocumentSnapshot> {
  try {
    const data = await fetchNeon(`/api/neon/${docRef.collection}/${docRef.id}`);
    return {
      id: docRef.id,
      exists: () => data !== null && data !== undefined && !data.error,
      data: () => data
    };
  } catch {
    return {
      id: docRef.id,
      exists: () => false,
      data: () => undefined
    };
  }
}

export async function getDocs(queryOrColl: CollectionReference | Query): Promise<QuerySnapshot> {
  const collectionName = 'type' in queryOrColl && queryOrColl.type === 'collection' 
    ? queryOrColl.path 
    : (queryOrColl as Query).collection;

  const url = new URL(`/api/neon/${collectionName}`, window.location.origin);
  if ('constraints' in queryOrColl) {
    for (const c of (queryOrColl as Query).constraints) {
      if (c.type === 'where') {
        url.searchParams.set('whereField', c.field);
        url.searchParams.set('whereValue', String(c.val));
      } else if (c.type === 'orderBy') {
        url.searchParams.set('orderBy', c.field);
        url.searchParams.set('direction', c.direction || 'asc');
      }
    }
  }

  try {
    const items: any[] = await fetchNeon(url.pathname + url.search);
    const docs = items.map(item => ({
      id: item.id,
      exists: () => true,
      data: () => item
    }));
    return {
      empty: docs.length === 0,
      size: docs.length,
      docs
    };
  } catch {
    return {
      empty: true,
      size: 0,
      docs: []
    };
  }
}

const mutationListeners = new Set<() => void>();
function notifyMutation() {
  mutationListeners.forEach(fn => fn());
}

export async function setDoc(docRef: DocumentReference, data: any, options?: { merge?: boolean }): Promise<void> {
  await fetchNeon(`/api/neon/${docRef.collection}/${docRef.id}?merge=${options?.merge !== false}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  notifyMutation();
}

export async function addDoc(collRef: CollectionReference, data: any): Promise<{ id: string }> {
  const res = await fetchNeon(`/api/neon/${collRef.path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  notifyMutation();
  return { id: res.id };
}

export async function updateDoc(docRef: DocumentReference, data: any): Promise<void> {
  await fetchNeon(`/api/neon/${docRef.collection}/${docRef.id}?merge=true`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  notifyMutation();
}

export async function deleteDoc(docRef: DocumentReference): Promise<void> {
  await fetchNeon(`/api/neon/${docRef.collection}/${docRef.id}`, {
    method: 'DELETE'
  });
  notifyMutation();
}

export function onSnapshot(
  target: DocumentReference | CollectionReference | Query,
  onNext: (snapshot: any) => void,
  onError?: (error: any) => void
): () => void {
  let isMounted = true;

  const fetchData = async () => {
    if (!isMounted) return;
    try {
      if ('id' in target) {
        const snap = await getDoc(target as DocumentReference);
        if (isMounted) onNext(snap);
      } else {
        const snap = await getDocs(target as any);
        if (isMounted) onNext(snap);
      }
    } catch (err) {
      if (isMounted && onError) onError(err);
    }
  };

  fetchData();
  const timer = setInterval(fetchData, 4000);
  mutationListeners.add(fetchData);

  return () => {
    isMounted = false;
    clearInterval(timer);
    mutationListeners.delete(fetchData);
  };
}
