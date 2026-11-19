
import { describe, expect, it, vi } from "vitest";
import {
  classifyImageUsage,
  destinationObjectKey,
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

    expect(
      classifyImageUsage(imagePath, [
        { documentPath: "products/p1" },
        { documentPath: "homepage/layout_config" },
        { documentPath: "Orders/o1" },
      ]).category,
    ).toBeNull();

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

    expect(destinationObjectKey(imagePath, "product", "/a.jpg")).toMatch(
      /^products\/migrated\/[a-f0-9]{64}\.jpg$/,
    );

    expect(destinationObjectKey(imagePath, "review", "/a.png")).toMatch(
      /^uploads\/reviews\/migrated\//,
    );
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
      expect(destinationObjectKey(path, result.category, path)).toMatch(/^uploads\/reviews\/migrated\//);
    }
  });

  it("classifies payment icons as site media from their rendered source-code use", () => {
    const usages = [{ file: "src/app/checkout/page.js", category: "site", source: "source_code" }];
    for (const name of ["visa.svg", "mastercard.svg", "Meeza.svg", "icons8-apple-pay.svg", "amex-svgrepo-com.svg"]) {
      const path = `/WIND_Shopping/${name}`;
      expect(classifyImageUsage(path, [], usages)).toEqual({ category: "site", reason: null });
      expect(destinationObjectKey(path, "site", path)).toMatch(/^site-media\/migrated\//);
    }
  });

  it("keeps destination keys stable when a migration resumes", () => {
    const first = destinationObjectKey(imagePath, "product", "/WIND_Shopping/a.jpg");
    expect(destinationObjectKey(imagePath, "product", "/WIND_Shopping/a.jpg")).toBe(first);
    expect(destinationObjectKey(imagePath, "review", "/WIND_Shopping/a.jpg")).not.toBe(first);
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
