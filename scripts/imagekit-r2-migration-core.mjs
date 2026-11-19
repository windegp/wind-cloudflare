import { createHash } from "node:crypto";
import { normalizeImageKitPath } from "../src/lib/media-utils.js";

export const MIGRATION_LAYOUT_VERSION = "products-migrated-v1";
const progressKey = (sourcePath, layoutVersion) => `${layoutVersion}:${sourcePath}`;

export function classifyImageUsage(sourcePath, references = [], localUsages = []) {
  const categories = new Set();
  const sourceSegments = sourcePath.split("/").filter(Boolean).map((segment) => segment.toLowerCase());
  const explicitlyReviewMedia = sourceSegments.includes("reviews");

  for (const reference of references) {
    const path = reference.documentPath || reference.collectionName || "";
    const parts = path.split("/");

    if (parts[0] === "products" && parts.length === 2) {
      categories.add(explicitlyReviewMedia ? "review" : "product");
    } else if (
      parts[0]?.toLowerCase() === "reviews" ||
      parts.at(-2)?.toLowerCase() === "reviews"
    ) {
      categories.add("review");
    } else if (
      ["collections", "categories"].includes(parts[0]?.toLowerCase())
    ) {
      categories.add("collection");
    } else if (
      ["settings", "homepage", "policies"].includes(parts[0]?.toLowerCase())
    ) {
      categories.add("site");
    }
  }

  for (const usage of localUsages) {
    if (explicitlyReviewMedia && usage.category === "product" && usage.source === "catalog_feed") {
      categories.add("review");
    } else if (usage.category) {
      categories.add(usage.category);
    }
  }

  // Homepage may reuse collection artwork; the collection record is its owner.
  if (categories.size === 2 && categories.has("collection") && categories.has("site")) {
    return { category: "collection", reason: null };
  }

  if (categories.size === 1) return { category: [...categories][0], reason: null };
  if (categories.size === 0) return { category: null, reason: "usage_not_identified" };

  return { category: null, reason: "conflicting_usage_categories" };
}

export function destinationObjectKey(sourcePath, category, filePath = sourcePath) {
  if (!["product", "review", "collection", "site"].includes(category)) throw new Error("Unresolved image usage category");
  const extension = String(filePath).match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (!extension || !["jpg", "jpeg", "png", "webp", "gif", "avif", "svg"].includes(extension)) throw new Error("Unresolved or unsupported image extension");
  const digest = createSourceDigest(sourcePath);
  const prefix = category === "product" ? "products/migrated" : category === "review" ? "uploads/reviews/migrated" : category === "collection" ? "collections/migrated" : "site-media/migrated";
  return `${prefix}/${digest}.${extension}`;
}

function createSourceDigest(sourcePath) {
  return createHash("sha256").update(sourcePath).digest("hex");
}

export function legacyObjectKey(sourcePath) {
  const segments = sourcePath.split("/").filter(Boolean);
  if (!segments.length || segments.some((segment) => segment === "." || segment === "..")) throw new Error(`Unsafe ImageKit file path: ${sourcePath}`);
  return `legacy/imagekit/${segments.join("/")}`;
}

export function sha256ForBytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function verifyCopiedBytes(expectedBytes, actualBytes, label = "copied image") {
  if (actualBytes.byteLength !== expectedBytes.byteLength) {
    throw new Error(`${label} size mismatch`);
  }
  const expectedSha256 = sha256ForBytes(expectedBytes);
  const actualSha256 = sha256ForBytes(actualBytes);
  if (actualSha256 !== expectedSha256) throw new Error(`${label} SHA-256 mismatch`);
  return expectedSha256;
}

function isCopyVerified(state, sourcePath, targetKey, layoutVersion = MIGRATION_LAYOUT_VERSION) {
  const record = state.copied?.[sourcePath];
  const copy = record?.destinations?.[layoutVersion];
  return Boolean(copy?.url && copy?.key === targetKey && copy?.sha256 && copy.status === "verified" && copy.layoutVersion === layoutVersion);
}

function referenceProgressKey(sourcePath, layoutVersion) {
  return progressKey(sourcePath, layoutVersion);
}

export function recordVerifiedDestination(state, sourcePath, copied, layoutVersion = MIGRATION_LAYOUT_VERSION) {
  state.copied ||= {};
  const prior = state.copied[sourcePath] || {};
  const legacy = prior.legacy || (prior.key?.startsWith("legacy/imagekit/") ? { ...prior } : undefined);
  state.copied[sourcePath] = {
    ...prior,
    ...(legacy ? { legacy } : {}),
    destinations: {
      ...(prior.destinations || {}),
      [layoutVersion]: { ...copied, status: "verified", layoutVersion },
    },
  };
  return state.copied[sourcePath].destinations[layoutVersion];
}

/** Walk every reachable Firestore collection recursively, reading each document once. */
export async function scanFirestoreRecursively(db, { collectPaths, countLinks }) {
  const referencesByPath = new Map();
  const countsByCollection = new Map();
  const seenCollectionPaths = new Set();
  const seenDocumentPaths = new Set();

  async function visitCollection(collectionRef) {
    if (seenCollectionPaths.has(collectionRef.path)) return;
    seenCollectionPaths.add(collectionRef.path);
    const snapshot = await collectionRef.get();
    let imageDocs = 0;
    let linkOccurrences = 0;
    let documents = 0;

    for (const doc of snapshot.docs) {
      const documentPath = doc.ref.path;
      if (seenDocumentPaths.has(documentPath)) continue;
      seenDocumentPaths.add(documentPath);

      const data = doc.data();
      documents += 1;
      const paths = collectPaths(data);
      if (paths.size) imageDocs += 1;
      linkOccurrences += countLinks(data);
      for (const sourcePath of paths) {
        if (!referencesByPath.has(sourcePath)) referencesByPath.set(sourcePath, new Map());
        referencesByPath.get(sourcePath).set(documentPath, {
          collectionName: collectionRef.path,
          docId: doc.id,
          documentPath,
        });
      }

      const subcollections = await doc.ref.listCollections();
      for (const subcollection of subcollections) await visitCollection(subcollection);
    }

    countsByCollection.set(collectionRef.path, {
      collection: collectionRef.path,
      documents,
      documentsWithImageKit: imageDocs,
      imageKitLinkOccurrences: linkOccurrences,
    });
  }

  for (const collectionRef of await db.listCollections()) await visitCollection(collectionRef);

  return {
    referencesByPath,
    counts: [...countsByCollection.values()],
    documentsScanned: seenDocumentPaths.size,
  };
}

/**
 * Convert the Firestore scan result into a JSON-safe manifest.
 * Map instances are converted into arrays so all document references survive.
 */
export function serializeFirestoreManifest(firestore) {
  if (!(firestore?.referencesByPath instanceof Map)) {
    throw new Error("Invalid Firestore scan result: referencesByPath must be a Map");
  }

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    documentsScanned: firestore.documentsScanned,
    counts: firestore.counts,
    referencesByPath: [...firestore.referencesByPath.entries()].map(
      ([sourcePath, references]) => ({
        sourcePath,
        references: [...references.values()],
      }),
    ),
  };
}

/**
 * Restore the exact Map structure expected by the migration engine.
 * Invalid manifests fail closed instead of silently triggering another scan.
 */
export function deserializeFirestoreManifest(manifest) {
  if (
    !manifest ||
    manifest.version !== 1 ||
    !Array.isArray(manifest.referencesByPath) ||
    !Array.isArray(manifest.counts) ||
    !Number.isInteger(manifest.documentsScanned)
  ) {
    throw new Error("Invalid or unsupported Firestore manifest");
  }

  const referencesByPath = new Map();

  for (const entry of manifest.referencesByPath) {
    if (
      !entry ||
      typeof entry.sourcePath !== "string" ||
      !entry.sourcePath ||
      !Array.isArray(entry.references)
    ) {
      throw new Error("Invalid Firestore manifest reference entry");
    }

    const references = new Map();

    for (const reference of entry.references) {
      if (
        !reference ||
        typeof reference.documentPath !== "string" ||
        !reference.documentPath
      ) {
        throw new Error("Invalid document reference in Firestore manifest");
      }

      references.set(reference.documentPath, reference);
    }

    referencesByPath.set(entry.sourcePath, references);
  }

  return {
    referencesByPath,
    counts: manifest.counts,
    documentsScanned: manifest.documentsScanned,
  };
}

export function sourcePathForFile(file) {

  const candidate = file.filePath.startsWith("/") ? file.filePath : `/${file.filePath}`;
  return normalizeImageKitPath(`https://ik.imagekit.io/windeg${candidate}`);
}

/** Refresh reference progress while preserving completed work for the same scan. */
export function refreshReferenceProgress(referencesByPath, state, scanId, layoutVersion = MIGRATION_LAYOUT_VERSION) {
  state.firestoreUpdated ||= {};

  const sourcePaths = new Set([
    ...referencesByPath.keys(),
  ]);

  for (const sourcePath of sourcePaths) {
    const currentDocumentPaths = [
      ...(referencesByPath.get(sourcePath)?.values() || []),
    ].map(({ documentPath }) => documentPath);

    const key = referenceProgressKey(sourcePath, layoutVersion);
    const progress = state.firestoreUpdated[key] ||= {
      documentPaths: [],
      processedDocumentPaths: [],
      updatedDocs: 0,
      replacedLinks: 0,
    };

    const isSameScan = progress.scanId === scanId;
    const currentPathSet = new Set(currentDocumentPaths);

    const processedDocumentPaths = isSameScan
      ? (progress.processedDocumentPaths || []).filter((documentPath) =>
          currentPathSet.has(documentPath),
        )
      : [];

    progress.scanId = scanId;
    progress.currentReferenceDocumentPaths = currentDocumentPaths;
    progress.processedDocumentPaths = processedDocumentPaths;
    progress.pendingDocumentPaths = currentDocumentPaths.filter(
      (documentPath) => !processedDocumentPaths.includes(documentPath),
    );
    progress.status = progress.pendingDocumentPaths.length ? "pending" : "complete";
    progress.scannedAt = new Date().toISOString();
  }

  return state.firestoreUpdated;
}



export function haveNoPendingCurrentReferences(referencesByPath, state, scanId, layoutVersion = MIGRATION_LAYOUT_VERSION) {
  for (const [sourcePath, references] of referencesByPath) {
    const progress = state.firestoreUpdated?.[referenceProgressKey(sourcePath, layoutVersion)];
    const currentDocumentPaths = [...references.values()].map(
      ({ documentPath }) => documentPath,
    );
    const processedDocumentPaths = new Set(
      progress?.processedDocumentPaths || [],
    );

    if (
      progress?.scanId !== scanId ||
      progress.status !== "complete" ||
      progress.pendingDocumentPaths?.length
    ) {
      return false;
    }

    if (
      currentDocumentPaths.some(
        (documentPath) => !processedDocumentPaths.has(documentPath),
      )
    ) {
      return false;
    }
  }

  return true;
}


/** Select the next bounded batch of files that need copying or reference reconciliation. */
export function selectPendingFiles(files, referencesByPath, state, limit = Infinity, layoutVersion = MIGRATION_LAYOUT_VERSION) {
  const pending = files.filter((file) => {
    const sourcePath = sourcePathForFile(file);

    if (!isCopyVerified(state, sourcePath, file.targetKey, layoutVersion)) return true;

    const references = referencesByPath.get(sourcePath);
    if (!references?.size) return false;

    const progress = state.firestoreUpdated?.[referenceProgressKey(sourcePath, layoutVersion)];

    if (
      !progress ||
      progress.status !== "complete" ||
      (progress.pendingDocumentPaths?.length || 0) > 0
    ) {
      return true;
    }

    const processed = new Set(progress.processedDocumentPaths || []);
    const currentDocumentPaths = [...references.values()].map(
      ({ documentPath }) => documentPath,
    );

    return currentDocumentPaths.some(
      (documentPath) => !processed.has(documentPath),
    );
  });

  return pending.slice(0, limit);
}


/** Persist a verified copy before reconciling only references not yet processed in this scan. */
export async function processFileWithCheckpoint({
  file,
  state,
  references,
  copyAndVerify,
  updateReferences,
  saveState,
  layoutVersion = MIGRATION_LAYOUT_VERSION,
}) {
  const sourcePath = sourcePathForFile(file);
  let copied = state.copied?.[sourcePath]?.destinations?.[layoutVersion];

  if (!isCopyVerified(state, sourcePath, file.targetKey, layoutVersion)) {
    copied = await copyAndVerify(file);
    copied = recordVerifiedDestination(state, sourcePath, copied, layoutVersion);
    await saveState();
  }

  state.firestoreUpdated ||= {};
  const key = referenceProgressKey(sourcePath, layoutVersion);
  const progress = state.firestoreUpdated[key] ||= {
    documentPaths: [],
    processedDocumentPaths: [],
    updatedDocs: 0,
    replacedLinks: 0,
  };

  progress.processedDocumentPaths ||= [];

  const currentDocumentPaths = [
    ...(references?.values?.() || references || []),
  ].map(({ documentPath }) => documentPath);

  const processed = new Set(progress.processedDocumentPaths);

  progress.currentReferenceDocumentPaths = currentDocumentPaths;
  progress.pendingDocumentPaths = currentDocumentPaths.filter(
    (documentPath) => !processed.has(documentPath),
  );
  progress.status = progress.pendingDocumentPaths.length ? "pending" : "complete";

  await updateReferences({
    sourcePath,
    copied,
    references,
    progress,
    saveState,
  });

  progress.status = progress.pendingDocumentPaths.length ? "pending" : "complete";
  progress.completedAt = progress.status === "complete"
    ? new Date().toISOString()
    : null;

  await saveState();

  return { sourcePath, copied, progress };
}

export function hasVerifiedCopy(state, sourcePath, targetKey, layoutVersion = MIGRATION_LAYOUT_VERSION) {
  return isCopyVerified(state, sourcePath, targetKey, layoutVersion);
}
