
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  assignDestinationKeys,
  buildMigrationPlan,
  classifyImageUsage,
  describeStateCompatibility,
  digestForSourcePath,
  foldRetiredLayoutReferences,
  legacyObjectKey,
  legacySourceDecision,
  loadSourceBytes,
  retiredLayoutDigest,
  retiredLayoutPseudoPath,
  sha256ForBytes,
  destinationObjectKey,
  isFinalMediaKey,
  sourcePathForFile,
  deserializeFirestoreManifest,
  hasVerifiedCopy,
  haveNoPendingCurrentReferences,
  MIGRATION_LAYOUT_VERSION,
  processFileWithCheckpoint,
  recordVerifiedDestination,
  refreshReferenceProgress,
  scanFirestoreRecursively,
  selectPendingFiles,
  verifyCopiedBytes,
  serializeFirestoreManifest,
} from "../scripts/imagekit-r2-migration-core.mjs";
import {
  collectImageKitPaths,
  updateReferencesForPath,
  verifyAndReconcileFirestoreReferences,
} from "../scripts/migrate-imagekit-to-r2.mjs";
import { normalizeImageKitPath, replaceImageKitUrlsDeep } from "../src/lib/media-utils.js";

const imageUrl = "https://ik.imagekit.io/windeg/WIND_Shopping/a.jpg";
const imagePath = normalizeImageKitPath(imageUrl);
const targetKey = destinationObjectKey(imagePath, "product", "/WIND_Shopping/a.jpg");
const targetUrl = `https://media.windeg.com/${targetKey}`;
const progressKey = `${MIGRATION_LAYOUT_VERSION}:${imagePath}`;

function fakeDocument(path, data, subcollections = []) {
  const dataMock = vi.fn(() => data);
  return {
    id: path.split("/").at(-1),
    ref: {
      path,
      listCollections: vi.fn(async () => subcollections),
    },
    data: dataMock,
  };
}

function fakeCollection(path, docs) {
  return {
    path,
    get: vi.fn(async () => ({ docs })),
  };
}

describe("ImageKit R2 migration checkpoints", () => {
  it("recursively scans nested collections and reads each document once", async () => {
    const review = fakeDocument("products/p1/reviews/r1", { photo: imageUrl });
    const history = fakeDocument("products/p1/inventoryHistory/h1", { photo: imageUrl });
    const reviews = fakeCollection("products/p1/reviews", [review]);
    const inventoryHistory = fakeCollection("products/p1/inventoryHistory", [history]);
    const product = fakeDocument("products/p1", { title: "Product" }, [reviews, reviews, inventoryHistory]);
    const products = fakeCollection("products", [product]);
    const order = fakeDocument("Orders/o1", { image: imageUrl });
    const orders = fakeCollection("Orders", [order]);
    const db = { listCollections: vi.fn(async () => [products, products, orders]) };

    const scanned = await scanFirestoreRecursively(db, {
      collectPaths: (value) => value.photo || value.image ? new Set([imagePath]) : new Set(),
      countLinks: (value) => value.photo || value.image ? 1 : 0,
    });

    expect(scanned.documentsScanned).toBe(4);
    expect(scanned.referencesByPath.get(imagePath).size).toBe(3);
    expect(scanned.referencesByPath.get(imagePath).has("products/p1/reviews/r1")).toBe(true);
    expect(scanned.referencesByPath.get(imagePath).has("products/p1/inventoryHistory/h1")).toBe(true);
    expect([products, orders, reviews, inventoryHistory].every((collection) => collection.get.mock.calls.length === 1)).toBe(true);
    expect([product, review, history, order].every((doc) => doc.data.mock.calls.length === 1)).toBe(true);
  });

  it("serializes and restores a Firestore manifest without losing document references", async () => {
    const review = fakeDocument("products/p1/reviews/r1", { photo: imageUrl });
    const product = fakeDocument("products/p1", { title: "Product" }, [
      fakeCollection("products/p1/reviews", [review]),
    ]);
    const products = fakeCollection("products", [product]);
    const db = { listCollections: vi.fn(async () => [products]) };

    const scanned = await scanFirestoreRecursively(db, {
      collectPaths: (value) => value.photo ? new Set([imagePath]) : new Set(),
      countLinks: (value) => value.photo ? 1 : 0,
    });

    const manifest = serializeFirestoreManifest(scanned);
    const restored = deserializeFirestoreManifest(
      JSON.parse(JSON.stringify(manifest)),
    );

    expect(restored.documentsScanned).toBe(2);
    expect(restored.counts).toEqual(scanned.counts);
    expect(restored.referencesByPath).toBeInstanceOf(Map);
    expect(restored.referencesByPath.get(imagePath)).toBeInstanceOf(Map);
    expect(
      restored.referencesByPath.get(imagePath).get("products/p1/reviews/r1"),
    ).toEqual({
      collectionName: "products/p1/reviews",
      docId: "r1",
      documentPath: "products/p1/reviews/r1",
    });
  });

  it("rejects an invalid Firestore manifest instead of silently accepting it", () => {
    expect(() => deserializeFirestoreManifest({ version: 99 })).toThrow(
      "Invalid or unsupported Firestore manifest",
    );
  });

  it("preserves completed documents when resuming the same scan", () => {
    const refs = new Map([
      ["products/p1", { documentPath: "products/p1" }],
      ["Orders/o1", { documentPath: "Orders/o1" }],
    ]);

    const state = {
      firestoreUpdated: {
        [progressKey]: {
          scanId: "scan-1",
          documentPaths: ["products/p1"],
          processedDocumentPaths: ["products/p1"],
          pendingDocumentPaths: ["Orders/o1"],
          status: "pending",
        },
      },
    };

    refreshReferenceProgress(new Map([[imagePath, refs]]), state, "scan-1");

    expect(state.firestoreUpdated[progressKey].processedDocumentPaths).toEqual([
      "products/p1",
    ]);
    expect(state.firestoreUpdated[progressKey].pendingDocumentPaths).toEqual([
      "Orders/o1",
    ]);
  });

  it("resets completed-document tracking when a new scan starts", () => {
    const refs = new Map([
      ["products/p1", { documentPath: "products/p1" }],
    ]);

    const state = {
      firestoreUpdated: {
        [progressKey]: {
          scanId: "scan-1",
          documentPaths: ["products/p1"],
          processedDocumentPaths: ["products/p1"],
          pendingDocumentPaths: [],
          status: "complete",
        },
      },
    };

    refreshReferenceProgress(new Map([[imagePath, refs]]), state, "scan-2");

    expect(state.firestoreUpdated[progressKey].processedDocumentPaths).toEqual([]);
    expect(state.firestoreUpdated[progressKey].pendingDocumentPaths).toEqual([
      "products/p1",
    ]);
    expect(state.firestoreUpdated[progressKey].status).toBe("pending");
  });

  it("limits each run to the next pending files and includes verified files with unfinished references", () => {
    const files = [1, 2, 3, 4].map((number) => {
      const file = { filePath: `/WIND_Shopping/${number}.jpg` };
      file.targetKey = destinationObjectKey(sourcePathForFile(file), "product", file.filePath);
      return file;
    });
    const state = { copied: {}, firestoreUpdated: {} };
    const refs = new Map();
    const pathFor = (file) => normalizeImageKitPath(`https://ik.imagekit.io/windeg${file.filePath}`);
    const firstTwo = selectPendingFiles(files, refs, state, 2);
    expect(firstTwo).toEqual(files.slice(0, 2));

    for (const file of firstTwo) {
      const sourcePath = pathFor(file);
      recordVerifiedDestination(state, sourcePath, { status: "verified", url: `https://media.windeg.com/${file.targetKey}`, key: file.targetKey, sha256: "abc" });
      state.firestoreUpdated[`${MIGRATION_LAYOUT_VERSION}:${sourcePath}`] = { documentPaths: [] };
    }

    expect(selectPendingFiles(files, refs, state, 2)).toEqual(files.slice(2, 4));

    const firstPath = pathFor(files[0]);
    refs.set(firstPath, new Map([["products/p1", { documentPath: "products/p1" }]]));
    expect(selectPendingFiles(files, refs, state, 1)).toEqual([files[0]]);
  });

  it("rediscovers a new ImageKit link in a document completed by an earlier run", async () => {
    const data = { title: "Product" };
    const product = fakeDocument("products/p1", data);
    const products = fakeCollection("products", [product]);
    const db = { listCollections: vi.fn(async () => [products]) };
    const scanOptions = {
      collectPaths: (value) => value.image ? new Set([imagePath]) : new Set(),
      countLinks: (value) => value.image ? 1 : 0,
    };
    const file = { filePath: "/WIND_Shopping/a.jpg", targetKey };
    const state = {
      copied: {
        [imagePath]: {
          status: "verified",
          url: "https://media.windeg.com/legacy/imagekit/WIND_Shopping/a.jpg",
          key: "legacy/imagekit/WIND_Shopping/a.jpg",
          sha256: "sha256-a",
        },
      },
      firestoreUpdated: {
        [imagePath]: {
          status: "complete",
          documentPaths: ["products/p1"],
          pendingDocumentPaths: [],
        },
      },
    };

    const firstScan = await scanFirestoreRecursively(db, scanOptions);
    refreshReferenceProgress(firstScan.referencesByPath, state, "previous-run");
    expect(haveNoPendingCurrentReferences(firstScan.referencesByPath, state, "previous-run")).toBe(true);

    data.image = imageUrl;
    const currentScan = await scanFirestoreRecursively(db, scanOptions);
    refreshReferenceProgress(currentScan.referencesByPath, state, "current-run");

    expect(currentScan.referencesByPath.get(imagePath).has("products/p1")).toBe(true);
    expect(selectPendingFiles([file], currentScan.referencesByPath, state, 1)).toEqual([file]);
    expect(state.firestoreUpdated[progressKey].pendingDocumentPaths).toEqual(["products/p1"]);
    expect(haveNoPendingCurrentReferences(currentScan.referencesByPath, state, "current-run")).toBe(false);
  });

  it("resumes Firestore reference updates after a verified copy without copying again", async () => {
    const file = { filePath: "/WIND_Shopping/a.jpg", targetKey };
    const state = { copied: {}, firestoreUpdated: {} };
    const copyAndVerify = vi.fn(async () => ({
      key: targetKey,
      url: targetUrl,
      sha256: "sha256-a",
      size: 12,
    }));
    const saveState = vi.fn(async () => {});
    let shouldFail = true;

    const updateReferences = vi.fn(async ({ progress, saveState: persist }) => {
      progress.processedDocumentPaths ||= [];
      progress.pendingDocumentPaths ||= [];

      if (!progress.documentPaths.includes("products/p1")) {
        progress.documentPaths.push("products/p1");
        progress.processedDocumentPaths.push("products/p1");
        progress.pendingDocumentPaths = progress.pendingDocumentPaths.filter(
          (documentPath) => documentPath !== "products/p1",
        );
        await persist();
      }

      if (shouldFail) {
        shouldFail = false;
        throw new Error("temporary Firestore failure");
      }

      if (!progress.documentPaths.includes("Orders/o1")) {
        progress.documentPaths.push("Orders/o1");
        progress.processedDocumentPaths.push("Orders/o1");
        progress.pendingDocumentPaths = progress.pendingDocumentPaths.filter(
          (documentPath) => documentPath !== "Orders/o1",
        );
      }

      progress.updatedDocs += 1;
      await persist();
    });

    await expect(processFileWithCheckpoint({ file, state, copyAndVerify, updateReferences, saveState }))
      .rejects.toThrow("temporary Firestore failure");

    expect(state.copied[imagePath].destinations[MIGRATION_LAYOUT_VERSION].status).toBe("verified");

    const resumed = await processFileWithCheckpoint({ file, state, copyAndVerify, updateReferences, saveState });

    expect(copyAndVerify).toHaveBeenCalledOnce();
    expect(updateReferences).toHaveBeenCalledTimes(2);
    expect(resumed.progress.documentPaths).toEqual(["products/p1", "Orders/o1"]);
    expect(resumed.progress.completedAt).toBeTruthy();
  });

  it("does not treat a verified legacy copy as a copy for the new layout", () => {
    const state = { copied: { [imagePath]: { key: "legacy/imagekit/WIND_Shopping/a.jpg", url: "https://media.windeg.com/legacy/imagekit/WIND_Shopping/a.jpg", sha256: "sha", status: "verified" } } };
    const file = { filePath: "/WIND_Shopping/a.jpg", targetKey };
    expect(hasVerifiedCopy(state, imagePath, targetKey)).toBe(false);
    expect(selectPendingFiles([file], new Map(), state)).toEqual([file]);
    const destination = recordVerifiedDestination(state, imagePath, { key: targetKey, url: targetUrl, sha256: "sha-new" });
    expect(destination.key).toBe(targetKey);
    expect(state.copied[imagePath].key).toBe("legacy/imagekit/WIND_Shopping/a.jpg");
    expect(hasVerifiedCopy(state, imagePath, targetKey)).toBe(true);
  });

  it("prioritizes specific media usage over shared homepage usage", () => {
    expect(
      classifyImageUsage(imagePath, [{ documentPath: "products/p1" }]).category,
    ).toBe("product");

    // The homepage showcases product photos, so the product record owns them (Orders carry no usage).
    expect(
      classifyImageUsage(imagePath, [
        { documentPath: "products/p1" },
        { documentPath: "homepage/layout_config" },
        { documentPath: "Orders/o1" },
      ]).category,
    ).toBe("product");

    // A hard-coded source-code link next to a product reference is still a real conflict.
    expect(
      classifyImageUsage(
        imagePath,
        [{ documentPath: "products/p1" }],
        [{ file: "src/components/Footer.js", category: "site", source: "source_code" }],
      ),
    ).toEqual({ category: null, reason: "conflicting_usage_categories" });

    expect(
      classifyImageUsage(imagePath, [{ documentPath: "products/p1" }, { documentPath: "collections/c1" }]).reason,
    ).toBe("conflicting_usage_categories");

    expect(
      classifyImageUsage(imagePath, [
        { documentPath: "collections/c1" },
        { documentPath: "homepage/layout_config" },
      ]).category,
    ).toBe("collection");

    expect(
      classifyImageUsage(imagePath, [
        { documentPath: "homepage/layout_config" },
      ]).category,
    ).toBe("site");

    expect(
      classifyImageUsage(
        imagePath,
        [{ documentPath: "products/p1" }],
        [{ category: "site" }],
      ).category,
    ).toBeNull();

    expect(
      classifyImageUsage(imagePath, [{ documentPath: "Orders/o1" }]).category,
    ).toBeNull();

    expect(
      classifyImageUsage(imagePath, [
        { documentPath: "products/p1" },
        { documentPath: "Reviews/r1" },
      ]),
    ).toMatchObject({
      category: null,
      reason: "conflicting_usage_categories",
    });

    expect(
      classifyImageUsage(imagePath, [
        { documentPath: "products/p1" },
        { documentPath: "collections/c1" },
      ]).category,
    ).toBeNull();

    expect(destinationObjectKey(imagePath, "product", "/a.jpg")).toBe("products/a.jpg");
    expect(destinationObjectKey(imagePath, "review", "/a.png")).toBe("uploads/reviews/a.png");
    expect(destinationObjectKey(imagePath, "collection", "/c.webp")).toBe("collections/c.webp");
  });

  it("classifies Review-namespace images in product docs and catalog feeds as reviews", () => {
    const paths = [
      "/WIND_Shopping/Reviews/wind_1781436494312_HasheraWF_vSXW2l8jB.png",
      "/WIND_Shopping/Reviews/wind_1781436500117_HasheraWB_2w25u7nFq.png",
      "/WIND_Shopping/Reviews/wind_1781436506274_HasheraBEF_XsQU0EW7B.png",
      "/WIND_Shopping/Reviews/wind_1781436511837_HasheraBEB_la7G9mGfM.png",
    ];
    for (const path of paths) {
      const result = classifyImageUsage(path, [{ documentPath: "products/hashir-waffle-short" }], [
        { category: "product", source: "catalog_feed" },
      ]);
      expect(result).toEqual({ category: "review", reason: null });
      expect(destinationObjectKey(path, result.category, path)).toBe(`uploads/reviews/${path.split("/").pop()}`);
    }
  });

  it("classifies payment icons as site media from their rendered source-code use", () => {
    const usages = [{ file: "src/app/checkout/page.js", category: "site", source: "source_code" }];
    for (const name of ["visa.svg", "mastercard.svg", "Meeza.svg", "icons8-apple-pay.svg", "amex-svgrepo-com.svg"]) {
      const path = `/WIND_Shopping/${name}`;
      expect(classifyImageUsage(path, [], usages)).toEqual({ category: "site", reason: null });
      expect(destinationObjectKey(path, "site", path)).toBe(`site-media/${name}`);
    }
  });

  it("keeps destination keys stable when a migration resumes", () => {
    const first = destinationObjectKey(imagePath, "product", "/WIND_Shopping/a.jpg");
    expect(destinationObjectKey(imagePath, "product", "/WIND_Shopping/a.jpg")).toBe(first);
    expect(destinationObjectKey(imagePath, "review", "/WIND_Shopping/a.jpg")).not.toBe(first);
  });

  it("never produces migrated or legacy segments and keeps original names", () => {
    for (const [category, prefix] of [["product", "products"], ["review", "uploads/reviews"], ["collection", "collections"], ["site", "site-media"]]) {
      const key = destinationObjectKey("/WIND_Shopping/HeroS (3).webp", category, "/WIND_Shopping/HeroS (3).webp");
      expect(key).toBe(`${prefix}/HeroS (3).webp`);
      expect(isFinalMediaKey(key)).toBe(true);
    }
    expect(isFinalMediaKey("products/migrated/a.jpg")).toBe(false);
    expect(isFinalMediaKey("uploads/reviews/migrated/a.jpg")).toBe(false);
    expect(isFinalMediaKey("legacy/imagekit/WIND_Shopping/a.jpg")).toBe(false);
    expect(isFinalMediaKey("products/legacy/a.jpg")).toBe(false);
    expect(isFinalMediaKey("products/")).toBe(false);
    expect(() => destinationObjectKey("/a/..", "product", "/a/..")).toThrow();
    expect(() => destinationObjectKey("/a/x.exe", "product", "/a/x.exe")).toThrow(/extension/);
  });

  it("qualifies only colliding names with their parent folder, regardless of order", () => {
    const entries = [
      { sourcePath: "/A/same.jpg", category: "product", filePath: "/A/same.jpg" },
      { sourcePath: "/B/Same.jpg", category: "product", filePath: "/B/Same.jpg" },
      { sourcePath: "/A/unique.jpg", category: "product", filePath: "/A/unique.jpg" },
      { sourcePath: "/Reviews/same.jpg", category: "review", filePath: "/Reviews/same.jpg" },
    ];
    const first = assignDestinationKeys(entries);
    const second = assignDestinationKeys([...entries].reverse());
    expect([...first.keys].sort()).toEqual([...second.keys].sort());
    expect(first.keys.get("/A/unique.jpg")).toBe("products/unique.jpg");
    expect(first.keys.get("/A/same.jpg")).toBe("products/A-same.jpg");
    expect(first.keys.get("/B/Same.jpg")).toBe("products/B-Same.jpg");
    expect(first.keys.get("/Reviews/same.jpg")).toBe("uploads/reviews/same.jpg");
    expect(first.disambiguated.map((d) => d.sourcePath).sort()).toEqual(["/A/same.jpg", "/B/Same.jpg"]);
    expect(first.errors.size).toBe(0);
  });

  it("falls back to digest suffixes, and a natural name always beats a generated one", () => {
    const digestOf = (sourcePath) => createHash("sha256").update(sourcePath).digest("hex");
    const natural = `/same-${digestOf("/same.jpg").slice(0, 10)}.jpg`;
    const entries = [
      { sourcePath: "/same.jpg", category: "product", filePath: "/same.jpg" },
      { sourcePath: "/SAME.jpg", category: "product", filePath: "/SAME.jpg" },
      { sourcePath: natural, category: "product", filePath: natural },
      // Natural name equal to the folder-qualified name of /A/other.jpg
      { sourcePath: "/A/other.jpg", category: "product", filePath: "/A/other.jpg" },
      { sourcePath: "/B/other.jpg", category: "product", filePath: "/B/other.jpg" },
      { sourcePath: "/A-other.jpg", category: "product", filePath: "/A-other.jpg" },
    ];
    const expected = assignDestinationKeys(entries);
    expect(expected.errors.size).toBe(0);
    expect(expected.keys.get(natural)).toBe(`products${natural}`);
    expect(expected.keys.get("/same.jpg")).toBe(`products/same-${digestOf("/same.jpg").slice(0, 16)}.jpg`);
    expect(expected.keys.get("/SAME.jpg")).toBe(`products/SAME-${digestOf("/SAME.jpg").slice(0, 10)}.jpg`);
    expect(expected.keys.get("/A-other.jpg")).toBe("products/A-other.jpg");
    expect(expected.keys.get("/A/other.jpg")).toBe(`products/other-${digestOf("/A/other.jpg").slice(0, 10)}.jpg`);
    expect(expected.keys.get("/B/other.jpg")).toBe("products/B-other.jpg");
    expect(new Set([...expected.keys.values()].map((k) => k.toLowerCase())).size).toBe(entries.length);

    const orders = [[0, 1, 2, 3, 4, 5], [5, 4, 3, 2, 1, 0], [2, 0, 5, 1, 4, 3], [3, 5, 0, 4, 2, 1], [1, 3, 4, 0, 5, 2]];
    for (const order of orders) {
      const result = assignDestinationKeys(order.map((i) => entries[i]));
      expect(Object.fromEntries(result.keys)).toEqual(Object.fromEntries(expected.keys));
      expect(result.errors.size).toBe(0);
    }
  });

  it("escalates digest length when two suffixed candidates collide and reports unresolvable ones for all involved", () => {
    const entries = [
      { sourcePath: "/x.jpg", category: "product", filePath: "/x.jpg" },
      { sourcePath: "/X.jpg", category: "product", filePath: "/X.jpg" },
    ];
    // Both sources share the first 10 digest characters but differ afterwards.
    const shortCollision = (sourcePath) => `abcdefghij${sourcePath === "/x.jpg" ? "1" : "2"}${"0".repeat(53)}`;
    const resolved = assignDestinationKeys(entries, { digest: shortCollision });
    expect(resolved.errors.size).toBe(0);
    expect(resolved.keys.get("/x.jpg")).toBe(`products/x-${shortCollision("/x.jpg").slice(0, 16)}.jpg`);
    expect(resolved.keys.get("/X.jpg")).toBe(`products/X-${shortCollision("/X.jpg").slice(0, 16)}.jpg`);
    for (const order of [entries, [...entries].reverse()]) {
      expect(Object.fromEntries(assignDestinationKeys(order, { digest: shortCollision }).keys)).toEqual(Object.fromEntries(resolved.keys));
    }

    const identical = assignDestinationKeys(entries, { digest: () => "f".repeat(64) });
    expect(identical.keys.size).toBe(0);
    expect(identical.errors.get("/x.jpg")).toBe("destination_key_collision");
    expect(identical.errors.get("/X.jpg")).toBe("destination_key_collision");
  });

  it("rejects conflicting duplicates for the same source path without depending on order", () => {
    const a = { sourcePath: "/A/y.jpg", category: "product", filePath: "/A/y.jpg" };
    const b = { sourcePath: "/A/y.jpg", category: "review", filePath: "/A/y.jpg" };
    for (const entries of [[a, b], [b, a]]) {
      const result = assignDestinationKeys(entries);
      expect(result.keys.has("/A/y.jpg")).toBe(false);
      expect(result.errors.get("/A/y.jpg")).toBe("conflicting_duplicate_source");
    }
    expect(assignDestinationKeys([a, { ...a }]).keys.get("/A/y.jpg")).toBe("products/y.jpg");
  });

  it("keeps assigned keys unchanged when unrelated files are added", () => {
    const base = [{ sourcePath: "/A/solo.jpg", category: "product", filePath: "/A/solo.jpg" }];
    const more = [...base, { sourcePath: "/Z/other.jpg", category: "site", filePath: "/Z/other.jpg" }];
    expect(assignDestinationKeys(more).keys.get("/A/solo.jpg")).toBe(assignDestinationKeys(base).keys.get("/A/solo.jpg"));
  });

  describe("legacy copies as the source for final destinations", () => {
    const sourcePath = "/WIND_Shopping/legacy-one.jpg";
    const bytes = Uint8Array.from([9, 8, 7, 6, 5]);
    const sha256 = sha256ForBytes(bytes);
    const goodRecord = { key: legacyObjectKey(sourcePath), url: "https://media.windeg.com/legacy/imagekit/WIND_Shopping/legacy-one.jpg", size: bytes.byteLength, sha256 };
    const stateWith = (record) => ({ copied: { [sourcePath]: record } });

    it("accepts flat and nested legacy records that match the derived key, SHA-256 and size", () => {
      expect(legacySourceDecision(stateWith(goodRecord), sourcePath, { expectedSize: 5 }).usable).toBe(true);
      expect(legacySourceDecision(stateWith({ legacy: goodRecord }), sourcePath).usable).toBe(true);
    });

    it("rejects legacy records that cannot be trusted", () => {
      expect(legacySourceDecision({ copied: {} }, sourcePath).reason).toBe("no_legacy_record");
      expect(legacySourceDecision(stateWith({ ...goodRecord, sha256: undefined }), sourcePath).reason).toBe("legacy_record_missing_sha256");
      expect(legacySourceDecision(stateWith({ ...goodRecord, size: undefined }), sourcePath).reason).toBe("legacy_record_missing_size");
      expect(legacySourceDecision(stateWith({ ...goodRecord, key: "legacy/imagekit/other.jpg" }), sourcePath).reason).toBe("legacy_key_does_not_match_source_path");
      expect(legacySourceDecision(stateWith(goodRecord), sourcePath, { expectedSize: 6 }).reason).toBe("legacy_size_differs_from_imagekit");
      expect(legacySourceDecision(stateWith({ key: "products/x.jpg", sha256, size: 5 }), sourcePath).reason).toBe("no_legacy_record");
    });

    it("uses the legacy bytes only after re-verifying them, and never touches ImageKit then", async () => {
      const downloadImageKit = vi.fn();
      const readLegacyObject = vi.fn(async () => ({ bytes, contentType: "image/jpeg" }));
      const result = await loadSourceBytes({ sourcePath, state: stateWith(goodRecord), expectedSize: 5, readLegacyObject, downloadImageKit });
      expect(result).toMatchObject({ origin: "legacy", sha256, legacyKey: goodRecord.key, fallbackReason: null });
      expect(readLegacyObject).toHaveBeenCalledWith(goodRecord.key);
      expect(downloadImageKit).not.toHaveBeenCalled();
    });

    it("falls back to ImageKit when the legacy object is missing, corrupted or the wrong size", async () => {
      const imageKitBytes = Uint8Array.from([1, 1, 1]);
      const downloadImageKit = vi.fn(async () => ({ bytes: imageKitBytes, contentType: "image/png" }));
      const cases = {
        missing: async () => { throw new Error("NoSuchKey"); },
        corrupted: async () => ({ bytes: Uint8Array.from([9, 8, 7, 6, 0]) }),
        wrongSize: async () => ({ bytes: Uint8Array.from([9, 8]) }),
      };
      for (const readLegacyObject of Object.values(cases)) {
        const result = await loadSourceBytes({ sourcePath, state: stateWith(goodRecord), readLegacyObject, downloadImageKit });
        expect(result.origin).toBe("imagekit");
        expect(result.fallbackReason).toMatch(/^legacy_copy_unverified/);
        expect(result.sha256).toBe(sha256ForBytes(imageKitBytes));
      }
      const noRecord = await loadSourceBytes({ sourcePath, state: { copied: {} }, readLegacyObject: vi.fn(), downloadImageKit });
      expect(noRecord).toMatchObject({ origin: "imagekit", fallbackReason: "no_legacy_record" });
    });
  });

  describe("compatibility with older state", () => {
    const old = "/WIND_Shopping/old.jpg";
    const flat = "/WIND_Shopping/flat.jpg";
    const baseState = {
      copied: {
        [flat]: { key: legacyObjectKey(flat), size: 3, sha256: "a".repeat(64) },
        [old]: { destinations: { "products-migrated-v1": { key: `products/migrated/${"b".repeat(64)}.jpg`, status: "verified", layoutVersion: "products-migrated-v1", url: "u", sha256: "b".repeat(64) } } },
      },
      firestoreUpdated: {
        [flat]: { status: "complete", processedDocumentPaths: ["products/a"] },
        [`products-migrated-v1:${old}`]: { status: "complete", processedDocumentPaths: ["products/b"] },
      },
    };

    it("never treats retired-layout or unprefixed records as complete for the final layout", () => {
      const stateOld = structuredClone(baseState);
      for (const [path, key] of [[flat, "products/flat.jpg"], [old, "products/old.jpg"]]) {
        expect(hasVerifiedCopy(stateOld, path, key)).toBe(false);
      }
      const file = { filePath: old, targetKey: "products/old.jpg" };
      const references = new Map([[old, new Map([["products/b", { documentPath: "products/b", collectionName: "products", docId: "b" }]])]]);
      expect(selectPendingFiles([file], references, stateOld, Infinity)).toHaveLength(1);
      refreshReferenceProgress(references, stateOld, "scan-1");
      expect(stateOld.firestoreUpdated[`${MIGRATION_LAYOUT_VERSION}:${old}`].pendingDocumentPaths).toEqual(["products/b"]);
      // Old progress is left untouched, so nothing is lost.
      expect(stateOld.firestoreUpdated[`products-migrated-v1:${old}`].status).toBe("complete");
    });

    it("keeps the legacy record when the final destination is recorded", () => {
      const state = structuredClone(baseState);
      recordVerifiedDestination(state, flat, { key: "products/flat.jpg", url: "https://media.windeg.com/products/flat.jpg", sha256: "a".repeat(64) });
      expect(state.copied[flat].legacy.key).toBe(legacyObjectKey(flat));
      expect(hasVerifiedCopy(state, flat, "products/flat.jpg")).toBe(true);
    });

    it("summarizes how old records relate to the final layout without mutating state", () => {
      const stateOld = structuredClone(baseState);
      const before = JSON.stringify(stateOld);
      const report = describeStateCompatibility(stateOld);
      expect(report).toMatchObject({
        copiedRecords: 2,
        legacyOnly: 1,
        legacyUsableAsSource: 1,
        retiredLayoutDestinations: 1,
        verifiedInCurrentLayout: 0,
        progressKeys: { currentLayout: 0, retiredLayoutPrefix: 1, unprefixedLegacy: 1 },
        unprefixedProgressCompleted: 1,
      });
      expect(JSON.stringify(stateOld)).toBe(before);
    });

    it("maps references written under the retired migrated layout back to their source path", () => {
      const sourcePathWithRef = "/WIND_Shopping/folded.jpg";
      const digest = digestForSourcePath(sourcePathWithRef);
      const url = `https://media.windeg.com/products/migrated/${digest}.jpg`;
      expect(retiredLayoutDigest(`products/migrated/${digest}.jpg`)).toBe(digest);
      expect(retiredLayoutDigest("products/example.jpg")).toBeNull();
      expect([...collectImageKitPaths({ image: url })]).toEqual([retiredLayoutPseudoPath(digest)]);

      const map = new Map([
        [retiredLayoutPseudoPath(digest), new Map([["products/p", { documentPath: "products/p" }]])],
        [retiredLayoutPseudoPath("c".repeat(64)), new Map([["products/q", { documentPath: "products/q" }]])],
      ]);
      const folded = foldRetiredLayoutReferences(map, [sourcePathWithRef]);
      expect(folded).toEqual([{ pseudo: retiredLayoutPseudoPath(digest), sourcePath: sourcePathWithRef }]);
      expect([...map.get(sourcePathWithRef).keys()]).toEqual(["products/p"]);
      expect(map.has(retiredLayoutPseudoPath("c".repeat(64)))).toBe(true);
    });

    it("rewrites a document that still holds a retired-layout URL to the final URL", async () => {
      const digest = digestForSourcePath(imagePath);
      const retiredUrl = `https://media.windeg.com/products/migrated/${digest}.jpg`;
      let stored = { images: [retiredUrl, "https://media.windeg.com/products/other.jpg"] };
      const ref = { path: "products/p1" };
      const db = {
        doc: () => ref,
        runTransaction: async (callback) => callback({ get: async () => ({ exists: true, data: () => stored }), set: (_ref, next) => { stored = next; } }),
      };
      const progress = { documentPaths: [], processedDocumentPaths: [], pendingDocumentPaths: [], updatedDocs: 0, replacedLinks: 0 };
      await updateReferencesForPath(db, imagePath, { url: targetUrl }, [{ documentPath: "products/p1", collectionName: "products", docId: "p1" }], progress, async () => {}, null);
      expect(stored.images).toEqual([targetUrl, "https://media.windeg.com/products/other.jpg"]);
    });
  });

  describe("dry-run plan", () => {
    const mk = (name, size = 4) => ({ filePath: `/WIND_Shopping/${name}`, targetKey: `products/${name}`, size, fileId: name });
    const refs = (...docs) => new Map(docs.map((d) => [d, { documentPath: d, collectionName: d.split("/")[0], docId: d.split("/")[1] }]));
    const legacyRecord = (name, size = 4) => ({ key: legacyObjectKey(`/WIND_Shopping/${name}`), size, sha256: "d".repeat(64) });

    it("counts copies from legacy, ImageKit fallbacks, existing objects, Firestore updates and remaining links", () => {
      const files = [mk("done.jpg"), mk("fromlegacy.jpg"), mk("badlegacy.jpg"), mk("fresh.jpg"), mk("inbucket.jpg")];
      const state = {
        copied: {
          "/WIND_Shopping/done.jpg": { destinations: { [MIGRATION_LAYOUT_VERSION]: { key: "products/done.jpg", url: "https://media.windeg.com/products/done.jpg", sha256: "e".repeat(64), status: "verified", layoutVersion: MIGRATION_LAYOUT_VERSION } } },
          "/WIND_Shopping/fromlegacy.jpg": legacyRecord("fromlegacy.jpg"),
          "/WIND_Shopping/badlegacy.jpg": { ...legacyRecord("badlegacy.jpg"), sha256: undefined },
        },
        firestoreUpdated: {},
      };
      const referencesByPath = new Map([
        ["/WIND_Shopping/fromlegacy.jpg", refs("products/p1", "collections/c1")],
        ["/WIND_Shopping/fresh.jpg", refs("products/p1")],
        ["/WIND_Shopping/missing.jpg", refs("products/p9")],
      ]);
      const bucketObjects = new Map([["products/inbucket.jpg", { size: 4, reusable: true }], ["products/fresh.jpg", { size: 9, reusable: false }]]);
      const plan = buildMigrationPlan({
        eligibleFiles: files,
        state,
        referencesByPath,
        bucketObjects,
        unresolvedReasons: new Map([["/WIND_Shopping/missing.jpg", "not_found_in_imagekit_library"]]),
        localSourceLinks: new Map([["/WIND_Shopping/missing.jpg", 2]]),
        staticFeedLinkCount: 100,
      });
      expect(plan).toMatchObject({
        eligibleImages: 5,
        alreadyVerifiedAtFinalDestination: 1,
        toCopy: 4,
        toCopyFromLegacy: 1,
        toCopyFromImageKit: 3,
        legacyFallbacks: { legacy_record_missing_sha256: 1 },
        alreadyInBucketReusable: 1,
        firestore: { referencePairsToUpdate: 3, distinctDocumentsToUpdate: 2, pathsAffected: 2 },
        remainingImageKitLinks: { firestoreReferencePairs: 1, sourceCodeLinks: 2, staticFeedExportsNotUpdated: 100 },
      });
      expect(plan.destinationConflicts).toEqual([{ sourcePath: "/WIND_Shopping/fresh.jpg", key: "products/fresh.jpg", reason: "existing_object_does_not_match_source" }]);
      expect(plan.unresolved).toEqual([{ sourcePath: "/WIND_Shopping/missing.jpg", reason: "not_found_in_imagekit_library" }]);
    });

    it("reports bucket-dependent figures as unknown rather than guessing when R2 was not read", () => {
      const plan = buildMigrationPlan({ eligibleFiles: [mk("a.jpg")], state: { copied: {} }, referencesByPath: new Map() });
      expect(plan.alreadyInBucketReusable).toBeNull();
      expect(plan.toCopyFromImageKit).toBe(1);
    });
  });

  it("verifies copied bytes by both size and SHA-256", () => {
    const source = Uint8Array.from([1, 2, 3, 4]);
    expect(verifyCopiedBytes(source, Uint8Array.from([1, 2, 3, 4]))).toMatch(/^[a-f0-9]{64}$/);
    expect(() => verifyCopiedBytes(source, Uint8Array.from([1, 2, 3]))).toThrow(/size mismatch/);
    expect(() => verifyCopiedBytes(source, Uint8Array.from([1, 2, 3, 5]))).toThrow(/SHA-256 mismatch/);
  });

  it("rewrites source-code ImageKit links only through the verified URL map", () => {
    const source = `const image = "${imageUrl}";`;
    expect(replaceImageKitUrlsDeep(source, new Map([[imagePath, targetUrl]]))).toBe(`const image = "${targetUrl}";`);
    expect(replaceImageKitUrlsDeep(source, new Map())).toBe(source);
  });

  it("rewrites both ImageKit and legacy R2 links in every referencing document", async () => {
    const legacyUrl = "https://media.windeg.com/legacy/imagekit/WIND_Shopping/a.jpg";
    const data = [
      { image: imageUrl, gallery: [legacyUrl] },
      { image: legacyUrl },
    ];
    const documents = ["products/p1", "products/p2"];
    const references = new Map(documents.map((documentPath) => [documentPath, { documentPath, collectionName: "products", docId: documentPath.split("/")[1] }]));
    const db = {
      doc: (documentPath) => ({ documentPath }),
      runTransaction: async (callback) => callback({
        get: async (ref) => ({ exists: true, data: () => data[documents.indexOf(ref.documentPath)] }),
        set: (ref, value) => { data[documents.indexOf(ref.documentPath)] = value; },
      }),
    };
    const progress = { documentPaths: [], processedDocumentPaths: [], pendingDocumentPaths: documents.slice(), updatedDocs: 0, replacedLinks: 0 };
    await updateReferencesForPath(db, imagePath, { url: targetUrl }, references, progress, async () => {}, "legacy/imagekit/WIND_Shopping/a.jpg");
    expect(data[0]).toEqual({ image: targetUrl, gallery: [targetUrl] });
    expect(data[1]).toEqual({ image: targetUrl });
    expect(progress.processedDocumentPaths).toEqual(documents);
    expect(progress.replacedLinks).toBe(3);
  });

  it("rediscovers legacy R2 URLs as references to their original ImageKit paths", () => {
    const found = collectImageKitPaths({ image: "https://media.windeg.com/legacy/imagekit/WIND_Shopping/a.jpg" });
    expect(found).toEqual(new Set([imagePath]));
  });
  it("reconciles all manifest documents and verifies Firestore read-back", async () => {
    const documents = ["products/p1", "products/p2"];
    const data = [
      { image: imageUrl, gallery: [`https://media.windeg.com/legacy/imagekit/WIND_Shopping/a.jpg`] },
      { image: imageUrl },
    ];

    const refsByDocument = new Map(
      documents.map((documentPath, index) => [
        documentPath,
        {
          path: documentPath,
          get: vi.fn(async () => ({
            exists: true,
            data: () => data[index],
          })),
        },
      ]),
    );

    const db = {
      doc: vi.fn((documentPath) => refsByDocument.get(documentPath)),
      runTransaction: vi.fn(async (callback) =>
        callback({
          get: async (ref) => {
            const index = documents.indexOf(ref.path);
            return { exists: true, data: () => data[index] };
          },
          set: (ref, value) => {
            data[documents.indexOf(ref.path)] = value;
          },
        }),
      ),
    };

    const references = new Map([
      [
        imagePath,
        new Map(
          documents.map((documentPath) => [
            documentPath,
            { documentPath },
          ]),
        ),
      ],
      [
        "/WIND_Shopping/another.jpg",
        new Map([["products/p1", { documentPath: "products/p1" }]]),
      ],
    ]);

    const state = {
      copied: {
        [imagePath]: {
          destinations: {
            [MIGRATION_LAYOUT_VERSION]: {
              status: "verified",
              layoutVersion: MIGRATION_LAYOUT_VERSION,
              key: targetKey,
              url: targetUrl,
              sha256: "verified-sha256",
            },
          },
        },
      },
    };

    const result = await verifyAndReconcileFirestoreReferences(
      db,
      references,
      state,
    );

    expect(result.documentsChecked).toBe(2);
    expect(result.documentsUpdated).toBe(2);
    expect(result.replacedLinks).toBe(3);
    expect(data[0]).toEqual({
      image: targetUrl,
      gallery: [targetUrl],
    });
    expect(data[1]).toEqual({ image: targetUrl });
    expect(refsByDocument.get("products/p1").get).toHaveBeenCalledTimes(1);
    expect(refsByDocument.get("products/p2").get).toHaveBeenCalledTimes(1);
  });

  it("refuses final reconciliation when an old path has no verified destination", async () => {
    const data = { image: imageUrl };
    const ref = { path: "products/p1" };
    const set = vi.fn();

    const db = {
      doc: vi.fn(() => ref),
      runTransaction: vi.fn(async (callback) =>
        callback({
          get: async () => ({
            exists: true,
            data: () => data,
          }),
          set,
        }),
      ),
    };

    const references = new Map([
      [
        imagePath,
        new Map([["products/p1", { documentPath: "products/p1" }]]),
      ],
    ]);

    await expect(
      verifyAndReconcileFirestoreReferences(db, references, { copied: {} }),
    ).rejects.toThrow("missing verified R2 destination");

    expect(set).not.toHaveBeenCalled();
    expect(data).toEqual({ image: imageUrl });
  });
  it("does not let old processed-document paths skip new-layout references", () => {
    const refs = new Map([["products/p1", { documentPath: "products/p1" }]]);
    const state = { copied: {}, firestoreUpdated: { [imagePath]: { status: "complete", processedDocumentPaths: ["products/p1"], pendingDocumentPaths: [] } } };
    recordVerifiedDestination(state, imagePath, { key: targetKey, url: targetUrl, sha256: "sha" });
    expect(selectPendingFiles([{ filePath: "/WIND_Shopping/a.jpg", targetKey }], new Map([[imagePath, refs]]), state)).toHaveLength(1);
  });

  it("does not update Firestore unless destination verification succeeds", async () => {
    const updateReferences = vi.fn();
    await expect(processFileWithCheckpoint({
      file: { filePath: "/WIND_Shopping/a.jpg", targetKey },
      state: { copied: {}, firestoreUpdated: {} },
      references: new Map([["products/p1", { documentPath: "products/p1" }]]),
      copyAndVerify: async () => { throw new Error("SHA-256 mismatch"); },
      updateReferences,
      saveState: async () => {},
    })).rejects.toThrow("SHA-256 mismatch");
    expect(updateReferences).not.toHaveBeenCalled();
  });
});
