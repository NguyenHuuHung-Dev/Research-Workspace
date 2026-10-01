type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { arrayValue: { values: FirestoreValue[] } }
  | { mapValue: { fields: Record<string, FirestoreValue> } };

type FirestoreDocument = { name: string; fields?: Record<string, FirestoreValue> };
type ListResult = { documents?: FirestoreDocument[]; nextPageToken?: string };
type FirestoreWrite = { update?: FirestoreDocument; delete?: string };

function encodeValue(value: unknown): FirestoreValue {
  if (value == null) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === "object") return { mapValue: { fields: encodeFields(value as Record<string, unknown>) } };
  throw new Error("Unsupported Firestore value");
}

function encodeFields(data: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined).map(([key, value]) => [key, encodeValue(value)]));
}

function decodeValue(value: FirestoreValue): unknown {
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("stringValue" in value) return value.stringValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeValue);
  return decodeFields(value.mapValue.fields || {});
}

function decodeFields(fields: Record<string, FirestoreValue>) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}

export class FirebaseAuthError extends Error {}

export class UserFirestore {
  private readonly root: string;
  private readonly userPrefix: string;

  constructor(readonly uid: string, private readonly token: string) {
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!projectId) throw new Error("Firebase project is not configured");
    this.root = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;
    this.userPrefix = `users/${uid}`;
  }

  private name(path: string) {
    if (path !== this.userPrefix && !path.startsWith(`${this.userPrefix}/`)) throw new Error("Invalid user path");
    return `${this.root}/${path.split("/").map(encodeURIComponent).join("/")}`;
  }

  private async request(url: string, init: RequestInit = {}) {
    const response = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json", ...init.headers },
      cache: "no-store",
    });
    if (!response.ok && response.status !== 404) {
      const body = await response.text();
      console.error("Firestore request failed", response.status, body.slice(0, 500));
      throw new Error("Could not access your workspace. Please try again.");
    }
    return response;
  }

  async getDoc<T extends object>(path: string): Promise<T | null> {
    const response = await this.request(this.name(path));
    if (response.status === 404) return null;
    const document = await response.json() as FirestoreDocument;
    return { ...decodeFields(document.fields || {}), id: path.split("/").at(-1) } as T;
  }

  async listDocs<T extends object>(collectionPath: string, pageSize = 400): Promise<T[]> {
    const output: T[] = [];
    let pageToken = "";
    do {
      const url = new URL(this.name(collectionPath));
      url.searchParams.set("pageSize", String(pageSize));
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const response = await this.request(url.toString());
      if (response.status === 404) return output;
      const result = await response.json() as ListResult;
      output.push(...(result.documents || []).map(document => ({
        ...decodeFields(document.fields || {}), id: document.name.split("/").at(-1),
      }) as T));
      pageToken = result.nextPageToken || "";
    } while (pageToken);
    return output;
  }

  async setDoc(path: string, data: Record<string, unknown>) {
    const response = await this.request(this.name(path), { method: "PATCH", body: JSON.stringify({ fields: encodeFields(data) }) });
    if (response.status === 404) throw new Error("Could not save this document.");
  }

  async commit(updates: Array<{ path: string; data: Record<string, unknown> }>, deletes: string[] = []) {
    const writes: FirestoreWrite[] = [
      ...updates.map(item => ({ update: { name: this.name(item.path).replace("https://firestore.googleapis.com/v1/", ""), fields: encodeFields(item.data) } })),
      ...deletes.map(path => ({ delete: this.name(path).replace("https://firestore.googleapis.com/v1/", "") })),
    ];
    const response = await this.request(`${this.root}:commit`, { method: "POST", body: JSON.stringify({ writes }) });
    if (response.status === 404) throw new Error("Could not save these documents.");
  }
}

export async function authenticateUser(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!token || !apiKey) throw new FirebaseAuthError("Your session has expired. Please refresh.");
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: token }), cache: "no-store",
  });
  if (!response.ok) throw new FirebaseAuthError("Your session has expired. Please refresh.");
  const result = await response.json() as { users?: Array<{ localId?: string }> };
  const uid = result.users?.[0]?.localId;
  if (!uid) throw new FirebaseAuthError("Your session has expired. Please refresh.");
  return { uid, store: new UserFirestore(uid, token) };
}
