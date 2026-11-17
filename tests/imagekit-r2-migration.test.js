
import { describe, expect, it, vi } from "vitest";
import {
  deserializeFirestoreManifest,
  haveNoPendingCurrentReferences,
  processFileWithCheckpoint,
  refreshReferenceProgress,
  scanFirestoreRecursively,
  selectPendingFiles,
  serializeFirestoreManifest,
} from "../scripts/imagekit-r2-migration-core.mjs";
import { normalizeImageKitPath } from "../src/lib/media-utils.js";

const imageUrl = "https://ik.imagekit.io/windeg/WIND_Shopping/a.jpg";
const imagePath = normalizeImageKitPath(imageUrl);

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
        [imagePath]: {
          scanId: "scan-1",
          documentPaths: ["products/p1"],
          processedDocumentPaths: ["products/p1"],
          pendingDocumentPaths: ["Orders/o1"],
          status: "pending",
        },
      },
    };

    refreshReferenceProgress(new Map([[imagePath, refs]]), state, "scan-1");

    expect(state.firestoreUpdated[imagePath].processedDocumentPaths).toEqual([
      "products/p1",
    ]);
    expect(state.firestoreUpdated[imagePath].pendingDocumentPaths).toEqual([
      "Orders/o1",
    ]);
  });

  it("resets completed-document tracking when a new scan starts", () => {
    const refs = new Map([
      ["products/p1", { documentPath: "products/p1" }],
    ]);

    const state = {
      firestoreUpdated: {
        [imagePath]: {
          scanId: "scan-1",
          documentPaths: ["products/p1"],
          processedDocumentPaths: ["products/p1"],
          pendingDocumentPaths: [],
          status: "complete",
        },
      },
    };

    refreshReferenceProgress(new Map([[imagePath, refs]]), state, "scan-2");

    expect(state.firestoreUpdated[imagePath].processedDocumentPaths).toEqual([]);
    expect(state.firestoreUpdated[imagePath].pendingDocumentPaths).toEqual([
      "products/p1",
    ]);
    expect(state.firestoreUpdated[imagePath].status).toBe("pending");
  });

  it("limits each run to the next pending files and includes verified files with unfinished references", () => {
    const files = [1, 2, 3, 4].map((number) => ({ filePath: `/WIND_Shopping/${number}.jpg` }));
    const state = { copied: {}, firestoreUpdated: {} };
    const refs = new Map();
    const pathFor = (file) => normalizeImageKitPath(`https://ik.imagekit.io/windeg${file.filePath}`);
    const firstTwo = selectPendingFiles(files, refs, state, 2);
    expect(firstTwo).toEqual(files.slice(0, 2));

    for (const file of firstTwo) {
      const sourcePath = pathFor(file);
      state.copied[sourcePath] = { status: "verified", url: `https://media.windeg.com/${file.filePath}`, key: file.filePath, sha256: "abc" };
      state.firestoreUpdated[sourcePath] = { documentPaths: [] };
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
    const file = { filePath: "/WIND_Shopping/a.jpg" };
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
    expect(state.firestoreUpdated[imagePath].pendingDocumentPaths).toEqual(["products/p1"]);
    expect(haveNoPendingCurrentReferences(currentScan.referencesByPath, state, "current-run")).toBe(false);
  });

  it("resumes Firestore reference updates after a verified copy without copying again", async () => {
    const file = { filePath: "/WIND_Shopping/a.jpg" };
    const state = { copied: {}, firestoreUpdated: {} };
    const copyAndVerify = vi.fn(async () => ({
      key: "legacy/imagekit/WIND_Shopping/a.jpg",
      url: "https://media.windeg.com/legacy/imagekit/WIND_Shopping/a.jpg",
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

    expect(state.copied[imagePath].status).toBe("verified");

    const resumed = await processFileWithCheckpoint({ file, state, copyAndVerify, updateReferences, saveState });

    expect(copyAndVerify).toHaveBeenCalledOnce();
    expect(updateReferences).toHaveBeenCalledTimes(2);
    expect(resumed.progress.documentPaths).toEqual(["products/p1", "Orders/o1"]);
    expect(resumed.progress.completedAt).toBeTruthy();
  });
});
