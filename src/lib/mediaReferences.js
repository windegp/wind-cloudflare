import { getGoogleAccessToken } from "./googleServiceAccount";
import { STORE_MEDIA_ORIGIN } from "./media-utils";

const FIRESTORE_SCOPE = "https://www.googleapis.com/auth/datastore";

// Exact lookups: these collections can be large, so they are queried by field instead of scanned.
export const MEDIA_REFERENCE_ARRAY_FIELDS = Object.freeze([{ collection: "products", field: "images" }]);

// Small collections that hold images (collection cards, homepage, settings, policy HTML) are read
// fully and searched for the file name, which also catches HTML text and nested maps.
export const MEDIA_REFERENCE_SCANNED_COLLECTIONS = Object.freeze([
  "collections",
  "categories",
  "homepage",
  "settings",
  "Policies",
  "policies",
]);

const PAGE_SIZE = 300;
const MAX_SCANNED_PAGES = 10;

function documentsBase(projectId) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

async function readJson(response, label) {
  if (!response.ok) throw new Error(`${label} failed (${response.status})`);
  return response.json();
}

/**
 * Looks for any Firestore document that still uses a managed media key.
 * Resolves { referenced, locations } and THROWS if any lookup cannot be completed, so callers can
 * fail closed instead of deleting on uncertainty.
 */
export async function findMediaReferences(key, {
  projectId = process.env.FIREBASE_PROJECT_ID,
  getToken = () => getGoogleAccessToken(FIRESTORE_SCOPE),
  fetchImpl = fetch,
} = {}) {
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID is not configured");
  const fileName = key.split("/").pop();
  const urls = [...new Set([
    `${STORE_MEDIA_ORIGIN}/${key.split("/").map(encodeURIComponent).join("/")}`,
    `${STORE_MEDIA_ORIGIN}/${key}`,
  ])];
  const token = await getToken();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const locations = [];

  for (const { collection, field } of MEDIA_REFERENCE_ARRAY_FIELDS) {
    for (const url of urls) {
      const rows = await readJson(await fetchImpl(`${documentsBase(projectId)}:runQuery`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: collection }],
            where: { fieldFilter: { field: { fieldPath: field }, op: "ARRAY_CONTAINS", value: { stringValue: url } } },
            limit: 5,
          },
        }),
      }), `${collection} reference query`);
      if (!Array.isArray(rows)) throw new Error(`${collection} reference query returned an unexpected response`);
      for (const row of rows) if (row?.document?.name) locations.push({ collection, document: row.document.name.split("/").pop() });
    }
  }

  for (const collection of MEDIA_REFERENCE_SCANNED_COLLECTIONS) {
    let pageToken = "";
    for (let page = 0; ; page += 1) {
      if (page >= MAX_SCANNED_PAGES) throw new Error(`${collection} is too large to scan for media references`);
      const query = `pageSize=${PAGE_SIZE}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
      const body = await readJson(await fetchImpl(`${documentsBase(projectId)}/${collection}?${query}`, { headers }), `${collection} reference scan`);
      for (const document of body?.documents || []) {
        if (JSON.stringify(document.fields || {}).includes(fileName)) {
          locations.push({ collection, document: document.name.split("/").pop() });
        }
      }
      pageToken = body?.nextPageToken || "";
      if (!pageToken) break;
    }
  }

  return { referenced: locations.length > 0, locations };
}
