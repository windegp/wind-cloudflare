import { normalizeImageKitPath } from "../src/lib/media-utils.js";

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

function isCopyVerified(state, sourcePath) {
  const copy = state.copied?.[sourcePath];
  // Prior script versions only wrote this record after public byte verification.
  return Boolean(copy?.url && copy?.key && copy?.sha256 && (copy.status === undefined || copy.status === "verified"));
}


/** Refresh reference progress while preserving completed work for the same scan. */
export function refreshReferenceProgress(referencesByPath, state, scanId) {
  state.firestoreUpdated ||= {};

  const sourcePaths = new Set([
    ...Object.keys(state.firestoreUpdated),
    ...referencesByPath.keys(),
  ]);

  for (const sourcePath of sourcePaths) {
    const currentDocumentPaths = [
      ...(referencesByPath.get(sourcePath)?.values() || []),
    ].map(({ documentPath }) => documentPath);

    const progress = state.firestoreUpdated[sourcePath] ||= {
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



export function haveNoPendingCurrentReferences(referencesByPath, state, scanId) {
  for (const [sourcePath, references] of referencesByPath) {
    const progress = state.firestoreUpdated?.[sourcePath];
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
export function selectPendingFiles(files, referencesByPath, state, limit = Infinity) {
  const pending = files.filter((file) => {
    const sourcePath = sourcePathForFile(file);
    if (!isCopyVerified(state, sourcePath)) return true;
    // A previously checked document may acquire another ImageKit link later.
    // The current scan, rather than an old completed-document list, is authoritative.
    return (referencesByPath.get(sourcePath)?.size || 0) > 0;
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
}) {
  const sourcePath = sourcePathForFile(file);
  let copied = state.copied?.[sourcePath];

  if (!isCopyVerified(state, sourcePath)) {
    copied = await copyAndVerify(file);
    state.copied ||= {};
    state.copied[sourcePath] = { ...copied, status: "verified" };
    copied = state.copied[sourcePath];
    await saveState();
  } else if (state.copied[sourcePath].status !== "verified") {
    state.copied[sourcePath].status = "verified";
    await saveState();
  }

  state.firestoreUpdated ||= {};
  const progress = state.firestoreUpdated[sourcePath] ||= {
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

export { isCopyVerified as hasVerifiedCopy };