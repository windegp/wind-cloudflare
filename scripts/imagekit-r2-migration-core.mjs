import { createHash } from "node:crypto";
import { normalizeImageKitPath } from "../src/lib/media-utils.js";

// Progress/destination records are keyed by this version. It must not match the retired
// "products-migrated-v1" layout, so records from that layout are never treated as final.
export const MIGRATION_LAYOUT_VERSION = "final-paths-v1";
export const RETIRED_LAYOUT_VERSIONS = Object.freeze(["products-migrated-v1"]);

export const FINAL_PREFIX_BY_CATEGORY = Object.freeze({
  product: "products",
  review: "uploads/reviews",
  collection: "collections",
  site: "site-media",
});
const SUPPORTED_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "avif", "svg"];

/** True only for clean final keys: a known category prefix, no temporary or legacy segments. */
export function isFinalMediaKey(key) {
  if (typeof key !== "string" || !key || key.startsWith("/")) return false;
  const segments = key.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || /^(migrated|legacy)$/i.test(segment))) return false;
  return Object.values(FINAL_PREFIX_BY_CATEGORY).some((prefix) => key.startsWith(`${prefix}/`) && key.length > prefix.length + 1);
}
const progressKey = (sourcePath, layoutVersion) => `${layoutVersion}:${sourcePath}`;

export function classifyImageUsage(sourcePath, references = [], localUsages = []) {
  const categories = new Set();
  let siteFromFirestore = false;
  let siteFromCode = false;
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
      siteFromFirestore = true;
    }
  }

  for (const usage of localUsages) {
    if (explicitlyReviewMedia && usage.category === "product" && usage.source === "catalog_feed") {
      categories.add("review");
    } else if (usage.category) {
      categories.add(usage.category);
      if (usage.category === "site") siteFromCode = true;
    }
  }

  // Homepage may reuse collection artwork; the collection record is its owner.
  if (categories.size === 2 && categories.has("collection") && categories.has("site")) {
    return { category: "collection", reason: null };
  }

  // Likewise the homepage showcases product photos; the product record is their owner. This applies only when
  // the "site" usage comes from Firestore homepage/settings, never from a hard-coded source-code link.
  if (categories.size === 2 && categories.has("product") && categories.has("site") && siteFromFirestore && !siteFromCode) {
    return { category: "product", reason: null };
  }

  if (categories.size === 1) return { category: [...categories][0], reason: null };
  if (categories.size === 0) return { category: null, reason: "usage_not_identified" };

  return { category: null, reason: "conflicting_usage_categories" };
}

function finalFileName(sourcePath, filePath) {
  const raw = String(filePath).split("/").filter(Boolean).pop() || "";
  const name = raw.normalize("NFC");
  const match = name.match(/^(.*)\.([a-z0-9]+)$/i);
  const extension = match?.[2]?.toLowerCase();
  const stem = match?.[1];
  if (!extension || !SUPPORTED_EXTENSIONS.includes(extension)) throw new Error("Unresolved or unsupported image extension");
  if (!stem || stem === "." || stem === ".." || /[\u0000-\u001f\u007f\\]/.test(stem)) throw new Error(`Unsafe image file name for ${sourcePath}`);
  return { stem, extension };
}

/**
 * Clean final key such as products/example.jpg. The original file name is kept; pass
 * disambiguate: true only when another source would otherwise land on the same key.
 */
export function destinationObjectKey(sourcePath, category, filePath = sourcePath, { disambiguate = false } = {}) {
  const prefix = FINAL_PREFIX_BY_CATEGORY[category];
  if (!prefix) throw new Error("Unresolved image usage category");
  const { stem, extension } = finalFileName(sourcePath, filePath);
  const suffix = disambiguate ? `-${createSourceDigest(sourcePath).slice(0, 10)}` : "";
  return `${prefix}/${stem}${suffix}.${extension}`;
}

const DIGEST_LENGTHS = Object.freeze([10, 16, 24, 40, 64]);

/**
 * Assign final keys to a whole batch at once. The result depends only on the SET of entries, never
 * on their order:
 *   1. A source whose natural key (prefix/original-name) is unique keeps it. Natural names always win,
 *      even over a generated name that happens to be identical.
 *   2. Sources that share a natural key (compared case-insensitively) first try a parent-folder-qualified
 *      name, then a digest suffix of progressively longer length; at each level every candidate is decided simultaneously, and a
 *      candidate is accepted only if no other source wants it and it is not already taken.
 *   3. Anything still ambiguous after the longest digest is reported in `errors`, for every source involved.
 * `digest` is injectable so tests can force collisions.
 */
export function assignDestinationKeys(entries, { digest = createSourceDigest } = {}) {
  const errors = new Map();
  const bySource = new Map();
  for (const entry of entries) {
    const prior = bySource.get(entry.sourcePath);
    if (!prior) { bySource.set(entry.sourcePath, entry); continue; }
    if (prior.category !== entry.category || prior.filePath !== entry.filePath) {
      errors.set(entry.sourcePath, "conflicting_duplicate_source");
    }
  }
  for (const sourcePath of errors.keys()) bySource.delete(sourcePath);

  const natural = new Map();
  for (const [sourcePath, { category, filePath }] of bySource) {
    try { natural.set(sourcePath, destinationObjectKey(sourcePath, category, filePath)); }
    catch (error) { errors.set(sourcePath, error?.message || "unsupported_destination"); }
  }

  const owners = new Map();
  for (const [sourcePath, key] of natural) {
    const id = key.toLowerCase();
    owners.set(id, [...(owners.get(id) || []), sourcePath]);
  }

  const keys = new Map();
  const disambiguated = [];
  const taken = new Set();
  let unresolved = [];
  for (const [sourcePath, key] of natural) {
    if (owners.get(key.toLowerCase()).length === 1) { keys.set(sourcePath, key); taken.add(key.toLowerCase()); }
    else unresolved.push(sourcePath);
  }

  // Level 1 qualifies the name with its parent folder (RoverTshirt/1.webp -> RoverTshirt-1.webp); later
  // levels append a digest of growing length.
  const levels = [{ folder: true }, ...DIGEST_LENGTHS.map((length) => ({ length }))];
  for (const level of levels) {
    if (!unresolved.length) break;
    const candidates = new Map();
    const wanted = new Map();
    for (const sourcePath of unresolved) {
      const { category, filePath } = bySource.get(sourcePath);
      const { stem, extension } = finalFileName(sourcePath, filePath);
      const prefix = FINAL_PREFIX_BY_CATEGORY[category];
      let candidate = null;
      if (level.folder) {
        const folder = String(filePath).split("/").filter(Boolean).slice(-2, -1)[0]?.normalize("NFC");
        if (folder && !/[\u0000-\u001f\u007f\\]/.test(folder) && folder !== "." && folder !== "..") candidate = `${prefix}/${folder}-${stem}.${extension}`;
      } else {
        candidate = `${prefix}/${stem}-${digest(sourcePath).slice(0, level.length)}.${extension}`;
      }
      if (!candidate) continue;
      candidates.set(sourcePath, candidate);
      const id = candidate.toLowerCase();
      wanted.set(id, (wanted.get(id) || 0) + 1);
    }
    const accepted = [];
    const next = [];
    for (const sourcePath of unresolved) {
      if (!candidates.has(sourcePath)) { next.push(sourcePath); continue; }
      const id = candidates.get(sourcePath).toLowerCase();
      if (wanted.get(id) === 1 && !taken.has(id)) accepted.push(sourcePath);
      else next.push(sourcePath);
    }
    for (const sourcePath of accepted) {
      disambiguated.push({ sourcePath, key: candidates.get(sourcePath) });
      keys.set(sourcePath, candidates.get(sourcePath));
      taken.add(candidates.get(sourcePath).toLowerCase());
    }
    unresolved = next;
  }
  for (const sourcePath of unresolved) errors.set(sourcePath, "destination_key_collision");

  return { keys, errors, disambiguated };
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

/* ------------------------------------------------------------------------------------------------
 * Legacy copies as a verified source for the final destinations
 * ---------------------------------------------------------------------------------------------- */

const SHA256_HEX = /^[a-f0-9]{64}$/;

function legacyRecordFor(state, sourcePath) {
  const record = state?.copied?.[sourcePath];
  if (!record || typeof record !== "object") return null;
  if (record.legacy && typeof record.legacy === "object") return record.legacy;
  if (typeof record.key === "string" && record.key.startsWith("legacy/imagekit/")) return record;
  return null;
}

/**
 * Decide whether the legacy R2 copy of a file may be used as the byte source for its final key.
 * It must be recorded at exactly the legacy key derived from the ImageKit path, carry a SHA-256 and a
 * size, and (when ImageKit listed a size) agree with ImageKit's size. Anything else falls back to ImageKit.
 */
export function legacySourceDecision(state, sourcePath, { expectedSize } = {}) {
  const record = legacyRecordFor(state, sourcePath);
  if (!record) return { usable: false, reason: "no_legacy_record", record: null };
  if (record.key !== legacyObjectKey(sourcePath)) return { usable: false, reason: "legacy_key_does_not_match_source_path", record };
  if (!SHA256_HEX.test(String(record.sha256 || ""))) return { usable: false, reason: "legacy_record_missing_sha256", record };
  if (!Number.isInteger(record.size) || record.size <= 0) return { usable: false, reason: "legacy_record_missing_size", record };
  if (Number(expectedSize) && Number(expectedSize) !== record.size) return { usable: false, reason: "legacy_size_differs_from_imagekit", record };
  return { usable: true, reason: null, record };
}

/**
 * Load the bytes for a final destination. A legacy copy is used only after its bytes are re-read and match
 * the recorded size and SHA-256; any mismatch or read failure falls back to ImageKit. Legacy copies are never
 * modified or deleted here.
 */
export async function loadSourceBytes({ sourcePath, state, expectedSize, readLegacyObject, downloadImageKit }) {
  const decision = legacySourceDecision(state, sourcePath, { expectedSize });
  let fallbackReason = decision.reason;
  if (decision.usable) {
    try {
      const legacy = await readLegacyObject(decision.record.key);
      if (legacy.bytes.byteLength !== decision.record.size) throw new Error("size mismatch");
      const sha256 = sha256ForBytes(legacy.bytes);
      if (sha256 !== decision.record.sha256) throw new Error("SHA-256 mismatch");
      return { bytes: legacy.bytes, sha256, contentType: legacy.contentType || null, origin: "legacy", legacyKey: decision.record.key, fallbackReason: null };
    } catch (error) {
      fallbackReason = `legacy_copy_unverified: ${error?.message || error}`;
    }
  }
  const downloaded = await downloadImageKit();
  return { bytes: downloaded.bytes, sha256: sha256ForBytes(downloaded.bytes), contentType: downloaded.contentType || null, origin: "imagekit", legacyKey: null, fallbackReason };
}

/* ------------------------------------------------------------------------------------------------
 * Retired "…/migrated/<sha256(sourcePath)>.<ext>" layout
 * ---------------------------------------------------------------------------------------------- */

const RETIRED_KEY = /^(?:products|uploads\/reviews|collections|site-media)\/migrated\/([a-f0-9]{64})\.[a-z0-9]+$/i;

/** Digest of a retired-layout key, or null. The digest is sha256(sourcePath), so it can be mapped back. */
export function retiredLayoutDigest(key) {
  return String(key || "").match(RETIRED_KEY)?.[1]?.toLowerCase() || null;
}

export function retiredLayoutPseudoPath(digest) {
  return `retired-layout:${digest}`;
}

export function digestForSourcePath(sourcePath) {
  return createSourceDigest(sourcePath);
}

/**
 * Move Firestore references found under a retired-layout URL onto the real ImageKit source path they
 * belong to. Pseudo paths that match no known source stay in the map so they are reported, not lost.
 */
export function foldRetiredLayoutReferences(referencesByPath, knownSourcePaths) {
  const byDigest = new Map([...knownSourcePaths].map((sourcePath) => [createSourceDigest(sourcePath), sourcePath]));
  const folded = [];
  for (const pseudo of [...referencesByPath.keys()].filter((key) => key.startsWith("retired-layout:"))) {
    const sourcePath = byDigest.get(pseudo.slice("retired-layout:".length));
    if (!sourcePath) continue;
    const target = referencesByPath.get(sourcePath) || new Map();
    for (const [documentPath, reference] of referencesByPath.get(pseudo)) target.set(documentPath, reference);
    referencesByPath.set(sourcePath, target);
    referencesByPath.delete(pseudo);
    folded.push({ pseudo, sourcePath });
  }
  return folded;
}

/* ------------------------------------------------------------------------------------------------
 * State compatibility report
 * ---------------------------------------------------------------------------------------------- */

/** Read-only summary of how old state records relate to the current layout. Never mutates state. */
export function describeStateCompatibility(state, layoutVersion = MIGRATION_LAYOUT_VERSION) {
  const report = {
    layoutVersion,
    copiedRecords: 0,
    legacyOnly: 0,
    legacyUsableAsSource: 0,
    legacyNotUsable: {},
    verifiedInCurrentLayout: 0,
    retiredLayoutDestinations: 0,
    destinationsWithNonFinalKey: [],
    progressKeys: { currentLayout: 0, retiredLayoutPrefix: 0, unprefixedLegacy: 0 },
    unprefixedProgressCompleted: 0,
  };
  for (const [sourcePath, record] of Object.entries(state?.copied || {})) {
    report.copiedRecords += 1;
    const destinations = record?.destinations || {};
    const current = destinations[layoutVersion];
    if (current?.status === "verified" && isFinalMediaKey(current.key)) report.verifiedInCurrentLayout += 1;
    if (current && !isFinalMediaKey(current.key)) report.destinationsWithNonFinalKey.push(sourcePath);
    for (const retired of RETIRED_LAYOUT_VERSIONS) if (destinations[retired]) report.retiredLayoutDestinations += 1;
    if (!current) {
      const decision = legacySourceDecision(state, sourcePath);
      if (decision.record) {
        report.legacyOnly += 1;
        if (decision.usable) report.legacyUsableAsSource += 1;
        else report.legacyNotUsable[decision.reason] = (report.legacyNotUsable[decision.reason] || 0) + 1;
      }
    }
  }
  for (const [key, progress] of Object.entries(state?.firestoreUpdated || {})) {
    if (key.startsWith(`${layoutVersion}:`)) report.progressKeys.currentLayout += 1;
    else if (RETIRED_LAYOUT_VERSIONS.some((version) => key.startsWith(`${version}:`))) report.progressKeys.retiredLayoutPrefix += 1;
    else {
      report.progressKeys.unprefixedLegacy += 1;
      if (progress?.status === "complete") report.unprefixedProgressCompleted += 1;
    }
  }
  return report;
}

/* ------------------------------------------------------------------------------------------------
 * Dry-run plan
 * ---------------------------------------------------------------------------------------------- */

/**
 * Pure summary of what an --apply run would do. `bucketObjects` is an optional Map(key -> { size, reusable })
 * read from R2; when absent, bucket-dependent figures are reported as null (unknown), never guessed.
 */
export function buildMigrationPlan({
  eligibleFiles,
  state,
  referencesByPath,
  layoutVersion = MIGRATION_LAYOUT_VERSION,
  bucketObjects = null,
  unresolvedReasons = new Map(),
  keyErrors = new Map(),
  disambiguatedKeys = [],
  localSourceLinks = new Map(),
  staticFeedLinkCount = 0,
}) {
  const plan = {
    eligibleImages: eligibleFiles.length,
    alreadyVerifiedAtFinalDestination: 0,
    toCopy: 0,
    toCopyFromLegacy: 0,
    toCopyFromImageKit: 0,
    legacyFallbacks: {},
    alreadyInBucketReusable: bucketObjects ? 0 : null,
    destinationConflicts: [],
    firestore: { referencePairsToUpdate: 0, distinctDocumentsToUpdate: 0, pathsAffected: 0 },
    remainingImageKitLinks: { firestoreReferencePairs: 0, sourceCodeLinks: 0, staticFeedExportsNotUpdated: staticFeedLinkCount },
    unresolved: [...unresolvedReasons.entries()].map(([sourcePath, reason]) => ({ sourcePath, reason })),
    keyErrors: [...keyErrors.entries()].map(([sourcePath, reason]) => ({ sourcePath, reason })),
    disambiguatedKeys,
  };
  const documents = new Set();

  for (const file of eligibleFiles) {
    const sourcePath = sourcePathForFile(file);
    const verified = isCopyVerified(state, sourcePath, file.targetKey, layoutVersion);
    if (verified) plan.alreadyVerifiedAtFinalDestination += 1;
    else {
      plan.toCopy += 1;
      const decision = legacySourceDecision(state, sourcePath, { expectedSize: file.size });
      if (decision.usable) plan.toCopyFromLegacy += 1;
      else {
        plan.toCopyFromImageKit += 1;
        if (decision.record) plan.legacyFallbacks[decision.reason] = (plan.legacyFallbacks[decision.reason] || 0) + 1;
      }
      const existing = bucketObjects?.get(file.targetKey);
      if (existing) {
        if (existing.reusable) plan.alreadyInBucketReusable += 1;
        else plan.destinationConflicts.push({ sourcePath, key: file.targetKey, reason: "existing_object_does_not_match_source" });
      }
    }

    const progress = state?.firestoreUpdated?.[`${layoutVersion}:${sourcePath}`];
    const pending = progress?.scanId && progress.pendingDocumentPaths
      ? progress.pendingDocumentPaths
      : [...(referencesByPath.get(sourcePath)?.keys() || [])];
    if (pending.length) plan.firestore.pathsAffected += 1;
    for (const documentPath of pending) { plan.firestore.referencePairsToUpdate += 1; documents.add(documentPath); }
  }
  plan.firestore.distinctDocumentsToUpdate = documents.size;

  for (const sourcePath of unresolvedReasons.keys()) {
    plan.remainingImageKitLinks.firestoreReferencePairs += referencesByPath.get(sourcePath)?.size || 0;
    plan.remainingImageKitLinks.sourceCodeLinks += localSourceLinks.get(sourcePath) || 0;
  }
  return plan;
}
