#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ImageKit from "imagekit";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  getApps as getAdminApps,
  initializeApp as initializeAdminApp,
  cert,
} from "firebase-admin/app";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import { normalizeImageKitPath, replaceImageKitUrlsDeep, STORE_MEDIA_ORIGIN } from "../src/lib/media-utils.js";
import {
  deserializeFirestoreManifest,
  hasVerifiedCopy,
  haveNoPendingCurrentReferences,
  processFileWithCheckpoint,
  refreshReferenceProgress,
  scanFirestoreRecursively,
  selectPendingFiles,
  serializeFirestoreManifest,
  sourcePathForFile,
} from "./imagekit-r2-migration-core.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_STATE_DIR = path.join(PROJECT_ROOT, "work", "imagekit-r2-migration");
const CATALOG_FEED_FILES = ["fb.xml", "google.xml", "tt.xml"];
const PAGE_SIZE = 1000;
const FIRESTORE_SCOPE = "https://www.googleapis.com/auth/datastore";


function parseArgs(argv) {
  const result = {
    apply: false,
    rewriteSource: false,
    refreshManifest: false,
    limit: Infinity,
    stateDir: DEFAULT_STATE_DIR,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--apply") {
      result.apply = true;
    } else if (arg === "--rewrite-source") {
      result.rewriteSource = true;
    } else if (arg === "--refresh-manifest") {
      result.refreshManifest = true;
    } else if (arg === "--limit") {
      result.limit = Number(argv[++i]);
    } else if (arg === "--state-dir") {
      if (!argv[i + 1]) throw new Error("--state-dir requires a path");
      result.stateDir = path.resolve(argv[++i]);
    } else if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(result.limit) && result.limit !== Infinity) {
    throw new Error("--limit must be a positive integer");
  }

  if (result.limit < 1) {
    throw new Error("--limit must be a positive integer");
  }

  if (result.apply && result.refreshManifest) {
    throw new Error(
      "--apply and --refresh-manifest cannot be used together. Refresh the manifest first, then run --apply separately.",
    );
  }

  return result;
}


async function loadLocalEnv() {
  const file = path.join(PROJECT_ROOT, ".env.local");
  let content = "";
  try { content = await readFile(file, "utf8"); } catch { return; }
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[1] in process.env) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value.replace(/\\n/g, "\n");
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function imageKitClient() {
  return new ImageKit({
    publicKey: process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY,
    privateKey: requiredEnv("IMAGEKIT_PRIVATE_KEY"),
    urlEndpoint: process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT || "https://ik.imagekit.io/windeg",
  });
}

async function listImageLibrary(client) {
  const files = [];
  for (let skip = 0; ; skip += PAGE_SIZE) {
    const page = await client.listFiles({ fileType: "image", type: "file", limit: PAGE_SIZE, skip });
    if (!Array.isArray(page)) throw new Error("ImageKit returned an unexpected file list response");
    files.push(...page.filter((item) => item.type === "file" && item.fileType === "image"));
    if (page.length < PAGE_SIZE) break;
  }
  return files;
}

function collectImageKitPaths(value, found = new Set()) {
  if (typeof value === "string") {
    for (const candidate of value.match(/https?:\/\/[^\s"'<>]+/g) || []) {
      const sourcePath = normalizeImageKitPath(candidate);
      if (sourcePath) found.add(sourcePath);
    }
  } else if (Array.isArray(value)) {
    for (const item of value) collectImageKitPaths(item, found);
  } else if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    for (const item of Object.values(value)) collectImageKitPaths(item, found);
  }
  return found;
}

function countImageKitLinks(value, wantedPath = null) {
  if (typeof value === "string") {
    let count = 0;
    for (const candidate of value.match(/https?:\/\/[^\s"'<>]+/g) || []) {
      const sourcePath = normalizeImageKitPath(candidate);
      if (sourcePath && (!wantedPath || sourcePath === wantedPath)) count += 1;
    }
    return count;
  }
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + countImageKitLinks(item, wantedPath), 0);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.values(value).reduce((sum, item) => sum + countImageKitLinks(item, wantedPath), 0);
  }
  return 0;
}

function getAdminDb() {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  let serviceAccount = null;
  try {
    serviceAccount = JSON.parse(readFileSync(path.join(PROJECT_ROOT, "scripts", "serviceAccountKey.json"), "utf8"));
  } catch { /* Use environment credentials below. */ }
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || serviceAccount?.client_email;
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || serviceAccount?.private_key || "").replace(/\\n/g, "\n");
  const effectiveProjectId = projectId || serviceAccount?.project_id;
  if (!effectiveProjectId || !clientEmail || !privateKey) {
    throw new Error("Firestore enumeration requires Firebase Admin credentials in FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY or scripts/serviceAccountKey.json");
  }
  const credential = cert({ projectId: effectiveProjectId, clientEmail, privateKey });
  const app = getAdminApps().length ? getAdminApps()[0] : initializeAdminApp({ credential, projectId: effectiveProjectId });
  return getAdminFirestore(app);
}


function getFirebaseProjectId() {
  let serviceAccount = null;

  try {
    serviceAccount = JSON.parse(
      readFileSync(
        path.join(PROJECT_ROOT, "scripts", "serviceAccountKey.json"),
        "utf8",
      ),
    );
  } catch {
    // Environment credentials may provide the project ID.
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    serviceAccount?.project_id;

  if (!projectId) {
    throw new Error(
      "Cannot determine Firebase project ID. Check Firebase environment variables or serviceAccountKey.json.",
    );
  }

  return projectId;
}

async function scanFirestoreAdmin(db) {
  return scanFirestoreRecursively(db, {
    collectPaths: collectImageKitPaths,
    countLinks: countImageKitLinks,
  });
}

function createR2Client() {
  const accountId = requiredEnv("CLOUDFLARE_ACCOUNT_ID");
  const accessKeyId = requiredEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requiredEnv("R2_SECRET_ACCESS_KEY");
  return new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function hashBytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function stableObjectKey(sourcePath) {
  const segments = sourcePath.split("/").filter(Boolean);
  if (!segments.length || segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error(`Unsafe ImageKit file path: ${sourcePath}`);
  }
  return `legacy/imagekit/${segments.join("/")}`;
}

function publicUrlForKey(key) {
  return `${STORE_MEDIA_ORIGIN}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

async function responseBytes(response, label) {
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function verifyPublicObject(key, expectedHash, expectedSize) {
  const response = await fetch(publicUrlForKey(key), { cache: "no-store" });
  const bytes = await responseBytes(response, "R2 public URL verification");
  if (bytes.byteLength !== expectedSize || hashBytes(bytes) !== expectedHash) {
    throw new Error(`Public R2 object did not match source bytes: ${key}`);
  }
}

async function copyAndVerify(file, { s3, bucket, state }) {
  const sourcePath = file.filePath.startsWith("/") ? file.filePath : `/${file.filePath}`;
  const key = stableObjectKey(sourcePath);
  const pathHash = hashBytes(new TextEncoder().encode(sourcePath));
  const sourceResponse = await fetch(file.url, { cache: "no-store" });
  const sourceBytes = await responseBytes(sourceResponse, "ImageKit source download");
  const sourceHash = hashBytes(sourceBytes);
  if (Number(file.size) && sourceBytes.byteLength !== Number(file.size)) {
    throw new Error(`ImageKit byte count mismatch for ${sourcePath}`);
  }

  let existing = null;
  try {
    existing = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch (error) {
    if (error?.$metadata?.httpStatusCode !== 404 && error?.name !== "NotFound" && error?.name !== "NoSuchKey") throw error;
  }

  if (existing) {
    if (existing.Metadata?.sourcepathhash !== pathHash || existing.ContentLength !== sourceBytes.byteLength) {
      throw new Error(`Refusing to overwrite a non-matching existing R2 key: ${key}`);
    }
    const existingObject = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const storedBytes = new Uint8Array(await existingObject.Body.transformToByteArray());
    if (hashBytes(storedBytes) !== sourceHash) throw new Error(`Existing R2 bytes differ from ImageKit: ${key}`);
  } else {
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: sourceBytes,
      ContentLength: sourceBytes.byteLength,
      ContentType: file.mime || sourceResponse.headers.get("content-type") || "application/octet-stream",
      CacheControl: "public, max-age=31536000, immutable",
      Metadata: { sourcepathhash: pathHash, sourcefileid: file.fileId, sourcebytesha256: sourceHash },
    }));
  }

  const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  if (head.ContentLength !== sourceBytes.byteLength || head.Metadata?.sourcepathhash !== pathHash) {
    throw new Error(`R2 HEAD verification failed for ${key}`);
  }
  await verifyPublicObject(key, sourceHash, sourceBytes.byteLength);

  const result = {
    sourcePath,
    sourceFileId: file.fileId,
    key,
    url: publicUrlForKey(key),
    size: sourceBytes.byteLength,
    sha256: sourceHash,
    verifiedAt: new Date().toISOString(),
  };
  state.copied[sourcePath] = result;
  return result;
}

function imageKitPathPresent(value, wantedPath) {
  return collectImageKitPaths(value).has(wantedPath);
}


async function updateReferencesForPath(db, sourcePath, newUrl, references, progress, persistProgress) {
  const referenceValues = references instanceof Map
    ? references.values()
    : references || [];

  progress.documentPaths ||= [];
  progress.processedDocumentPaths ||= [];
  progress.pendingDocumentPaths ||= [];

  const processed = new Set(progress.processedDocumentPaths);

  for (const reference of referenceValues) {
    const { collectionName, docId } = reference;
    const documentPath = reference.documentPath || `${collectionName}/${docId}`;

    // Do not read a document already completed in this exact scan.
    if (processed.has(documentPath)) continue;

    const ref = db.doc(documentPath);

    const changed = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);

      if (!snapshot.exists) return 0;

      const current = snapshot.data();

      if (!imageKitPathPresent(current, sourcePath)) return 0;

      const replacementMap = new Map([[sourcePath, newUrl]]);
      const next = replaceImageKitUrlsDeep(current, replacementMap);
      const count = countImageKitLinks(current, sourcePath);

      transaction.set(ref, next);
      return count;
    });

    if (changed) {
      progress.updatedDocs += 1;
      progress.replacedLinks += changed;

      await appendLog({
        type: "firestore_reference_updated",
        sourcePath,
        collectionName,
        docId,
        documentPath,
        at: new Date().toISOString(),
      });
    }

    if (!progress.documentPaths.includes(documentPath)) {
      progress.documentPaths.push(documentPath);
    }

    if (!progress.processedDocumentPaths.includes(documentPath)) {
      progress.processedDocumentPaths.push(documentPath);
    }

    progress.pendingDocumentPaths = progress.pendingDocumentPaths.filter(
      (pendingPath) => pendingPath !== documentPath,
    );

    progress.status = progress.pendingDocumentPaths.length ? "pending" : "complete";

    // Persist after each document so interruption does not lose completed work.
    await persistProgress();

    processed.add(documentPath);
  }

  return progress;
}


async function listSourceFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".open-next" || entry.name === ".git") continue;
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await listSourceFiles(fullPath));
    else if (/\.(js|jsx|ts|tsx|css|html|svg|json|md)$/i.test(entry.name)) files.push(fullPath);
  }
  return files;
}

async function rewriteLocalSource(pathToNewUrl) {
  let filesChanged = 0;
  const targets = await listSourceFiles(path.join(PROJECT_ROOT, "src"));
  for (const relativePath of CATALOG_FEED_FILES) {
    targets.push(path.join(PROJECT_ROOT, relativePath));
  }
  for (const filePath of targets) {
    try { await readFile(filePath, "utf8"); } catch { continue; }
    const original = await readFile(filePath, "utf8");
    const updated = replaceImageKitUrlsDeep(original, pathToNewUrl);
    if (updated === original) continue;
    const temporaryPath = `${filePath}.r2-migration.tmp`;
    await writeFile(temporaryPath, updated, "utf8");
    await rename(temporaryPath, filePath);
    filesChanged += 1;
  }
  return filesChanged;
}

async function scanLocalSourceReferences() {
  const sourceFiles = await listSourceFiles(path.join(PROJECT_ROOT, "src"));
  const targets = [...sourceFiles, ...CATALOG_FEED_FILES.map((name) => path.join(PROJECT_ROOT, name))];
  const paths = new Set();
  let scannedFiles = 0;
  for (const filePath of targets) {
    let text;
    try { text = await readFile(filePath, "utf8"); } catch { continue; }
    scannedFiles += 1;
    for (const sourcePath of collectImageKitPaths(text)) paths.add(sourcePath);
  }
  return { sourceFiles: scannedFiles, paths };
}

let logFile = "";
async function appendLog(entry) {
  await appendFile(logFile, `${JSON.stringify(entry)}\n`, "utf8");
}

async function saveState(filePath, state) {
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(state, null, 2), "utf8");
  await rename(temporaryPath, filePath);
}

async function loadOrCreateFirestoreManifest({
  manifestFile,
  projectId,
  refreshManifest,
  apply,
}) {
  let existingText = null;

  if (!refreshManifest) {
    try {
      existingText = await readFile(manifestFile, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  if (existingText !== null) {
    if (!existingText.trim()) {
      throw new Error(
        "Firestore manifest is empty. Use --refresh-manifest to rebuild it.",
      );
    }

    let manifest;

    try {
      manifest = JSON.parse(existingText);
    } catch {
      throw new Error(
        "Firestore manifest contains invalid JSON. Use --refresh-manifest to rebuild it.",
      );
    }

    if (
      manifest.projectId !== projectId ||
      typeof manifest.scanId !== "string" ||
      !manifest.scanId
    ) {
      throw new Error(
        "Firestore manifest project or scan ID is invalid or does not match the current Firebase project. Use --refresh-manifest to rebuild it.",
      );
    }

    const firestore = deserializeFirestoreManifest(manifest);

    return {
      firestore,
      scanId: manifest.scanId,
      createdAt: manifest.createdAt,
      reused: true,
    };
  }

  if (apply) {
    throw new Error(
      "No Firestore manifest exists. Run once without --apply to create and review the manifest before migration.",
    );
  }

  const scanId = randomUUID();
  console.log("Creating a new Firestore inventory. This performs a full Firestore scan...");

  const firestore = await scanFirestoreAdmin(getAdminDb());
  const serialized = serializeFirestoreManifest(firestore);

  const manifest = {
    ...serialized,
    projectId,
    scanId,
  };

  await saveState(manifestFile, manifest);

  return {
    firestore,
    scanId,
    createdAt: manifest.createdAt,
    reused: false,
  };
}


async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: node scripts/migrate-imagekit-to-r2.mjs [--apply] [--refresh-manifest] [--limit N] [--state-dir PATH] [--rewrite-source]");
console.log("Default creates or reuses a local Firestore manifest without changing Firestore. --apply copies/verifies R2 files and updates matching Firestore URLs. --refresh-manifest performs a new full Firestore scan. ImageKit objects are never deleted.");
    return;
  }

  await loadLocalEnv();
  await mkdir(options.stateDir, { recursive: true });
  logFile = path.join(options.stateDir, "events.jsonl");
  const stateFile = path.join(options.stateDir, "state.json");
  let state = { copied: {}, startedAt: new Date().toISOString() };
  try { state = JSON.parse(await readFile(stateFile, "utf8")); } catch { /* First run. */ }
  if (!state.copied || typeof state.copied !== "object") state.copied = {};


  const projectId = getFirebaseProjectId();
  const manifestFile = path.join(options.stateDir, "firestore-manifest.json");

  const manifestResult = await loadOrCreateFirestoreManifest({
    manifestFile,
    projectId,
    refreshManifest: options.refreshManifest,
    apply: options.apply,
  });

  const firestore = manifestResult.firestore;
  const scanId = manifestResult.scanId;

  refreshReferenceProgress(firestore.referencesByPath, state, scanId);

  const imagekit = imageKitClient();

  const [files, localSource] = await Promise.all([
    listImageLibrary(imagekit),
    scanLocalSourceReferences(),
  ]);

  const distinctPaths = new Map();
  for (const file of files) {
    const sourcePath = sourcePathForFile(file);
    if (!distinctPaths.has(sourcePath)) distinctPaths.set(sourcePath, file);
  }
  const listedPaths = new Set(distinctPaths.keys());
  const missingFirestorePaths = [...firestore.referencesByPath.keys()].filter((sourcePath) => !listedPaths.has(sourcePath));
  const missingSourcePaths = [...localSource.paths].filter((sourcePath) => !listedPaths.has(sourcePath));
  const unresolvedPaths = [...new Set([...missingFirestorePaths, ...missingSourcePaths])];
  const selectedFiles = selectPendingFiles([...distinctPaths.values()], firestore.referencesByPath, state, options.limit);
  const remainingFiles = [...distinctPaths.keys()].filter((sourcePath) => !hasVerifiedCopy(state, sourcePath));
  const selectedPaths = new Set(selectedFiles.map(sourcePathForFile));
  const skippedVerifiedFiles = [...distinctPaths.keys()].filter((sourcePath) =>
    hasVerifiedCopy(state, sourcePath) && !selectedPaths.has(sourcePath),
  ).length;

  console.log(JSON.stringify({
    mode: options.apply ? "apply" : "dry-run",
    project: projectId,
    firestoreManifest: {
      file: manifestFile,
      reused: manifestResult.reused,
      scanId,
      createdAt: manifestResult.createdAt,
    },
    imageKitLibraryFiles: files.length,
    uniqueImageKitPaths: distinctPaths.size,
    firestoreCollections: firestore.counts,
    firestoreDistinctImageKitPaths: firestore.referencesByPath.size,
    firestoreDocumentPathPairs: [...firestore.referencesByPath.values()].reduce((sum, refs) => sum + refs.size, 0),
    firestoreDocumentsScanned: firestore.documentsScanned,
    firestoreImageKitLinkOccurrences: firestore.counts.reduce((sum, row) => sum + (row.imageKitLinkOccurrences || 0), 0),
    projectMediaFilesScanned: localSource.sourceFiles,
    projectImageKitPaths: localSource.paths.size,
    firestorePathsMissingFromImageKitLibrary: missingFirestorePaths,
    sourceCodePathsMissingFromImageKitLibrary: missingSourcePaths,
    filesSelectedThisRun: selectedFiles.length,
    filesRemainingToCopy: remainingFiles.length,
    filesSkippedAsAlreadyCopiedAndReconciled: skippedVerifiedFiles,
    r2Bucket: options.apply ? process.env.R2_BUCKET_NAME || "wind-shopping-media" : "not connected in dry-run",
    imageKitOriginalsDeleted: 0,
  }, null, 2));

  if (!options.apply) return;

  const s3 = createR2Client();
  const adminDb = getAdminDb();
  const bucket = process.env.R2_BUCKET_NAME || "wind-shopping-media";
  let fileFailures = 0;
  for (const sourcePath of unresolvedPaths) {
    await appendLog({ type: "unresolved_imagekit_reference", sourcePath, reason: "not_found_in_imagekit_library", at: new Date().toISOString() });
  }
  for (const file of selectedFiles) {
    const sourcePath = sourcePathForFile(file);
    try {
      const references = firestore.referencesByPath.get(sourcePath);
      const outcome = await processFileWithCheckpoint({
        file,
        state,
        references,
        copyAndVerify: (candidate) => copyAndVerify(candidate, { s3, bucket, state }),
        updateReferences: ({ sourcePath: pathToUpdate, copied: verifiedCopy, references: currentReferences, progress, saveState: persist }) =>
          updateReferencesForPath(adminDb, pathToUpdate, verifiedCopy.url, currentReferences, progress, persist),
        saveState: () => saveState(stateFile, state),
      });
      await appendLog({ type: "file_reconciled", sourcePath, ...outcome.copied, updatedDocs: outcome.progress.updatedDocs, replacedLinks: outcome.progress.replacedLinks, at: new Date().toISOString() });
      console.log(`VERIFIED ${sourcePath} (${outcome.copied.size} bytes); Firestore references updated: ${outcome.progress.documentPaths.length}`);
    } catch (error) {
      fileFailures += 1;
      await appendLog({ type: "file_failed", sourcePath, fileId: file.fileId, error: error?.message || String(error), at: new Date().toISOString() });
      console.error(`FAILED ${sourcePath}: ${error?.message || error}`);
    }
  }

  const allFilesCopied = [...distinctPaths.keys()].every((sourcePath) => hasVerifiedCopy(state, sourcePath));
  const noPendingReferences = haveNoPendingCurrentReferences(firestore.referencesByPath, state, scanId);
  const libraryComplete = fileFailures === 0 && allFilesCopied && noPendingReferences && unresolvedPaths.length === 0;
  if (options.rewriteSource && libraryComplete) {
    const pathToNewUrl = new Map([...distinctPaths.keys()].map((sourcePath) => [sourcePath, state.copied[sourcePath].url]));
    const changedFiles = await rewriteLocalSource(pathToNewUrl);
    await appendLog({ type: "local_source_rewrite_complete", filesChanged: changedFiles, at: new Date().toISOString() });
    console.log(`Updated ${changedFiles} local source files after all ImageKit images were verified.`);
  } else if (options.rewriteSource) {
    console.log("Skipped local source rewrites: run without --limit and resolve all missing source paths and copy failures first.");
  }

  await saveState(stateFile, state);
  await s3.destroy();
  console.log(JSON.stringify({
    complete: libraryComplete,
    copiedAndVerified: [...distinctPaths.keys()].filter((sourcePath) => hasVerifiedCopy(state, sourcePath)).length,
    filesRemainingToCopy: [...distinctPaths.keys()].filter((sourcePath) => !hasVerifiedCopy(state, sourcePath)).length,
    filesSelectedThisRun: selectedFiles.length,
    failures: fileFailures,
    firestoreReferencesReconciled: noPendingReferences,
    unresolvedImageKitPaths: unresolvedPaths,
    imageKitOriginalsDeleted: 0,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Migration stopped safely: ${error?.message || error}`);
    process.exitCode = 1;
  });
}
