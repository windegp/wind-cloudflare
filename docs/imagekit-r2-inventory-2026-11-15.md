# ImageKit to R2 inventory and migration boundary

Audit date: 2026-11-15 (Africa/Cairo)
Firestore project: `wind-reviews`
R2 bucket: `wind-shopping-media`
Public domain: `https://media.windeg.com` (Cloudflare reports the domain and SSL active)

## Inventory findings

Firestore image references occur in product catalog data, collection cards, order line item snapshots, homepage layout/hero documents, the site settings logo, and policy HTML. The migration utility traverses nested strings, arrays, maps, and HTML text, and now recursively scans every reachable Firestore collection and subcollection while deduplicating collection and document paths. It does not assume that reviews are empty forever: the new uploader still supports customer review images.

| Firestore collection/group | Documents in inventory snapshot | Documents with ImageKit links |
|---|---:|---:|
| `products` | 81 | 81 |
| `Reviews` | 150 | 0 |
| `collections` | 42 | 7 |
| `Orders` | 789 | 153 |
| `Customers` | 834 | 0 |
| `ProductStats` | 29 | 0 |
| `offers` | 4 | 0 |
| `promoCodes` | 1 | 0 |
| `visitor_events` | 10,929 | 0 |
| `homepage` | 2 | 2 |
| `settings` | 4 | 1 |
| `Policies` | 4 | 1 |
| `collectionGroup:inventoryHistory` | 663 | 0 |

The previously completed read-only Firestore scan counted 1,377 ImageKit URL occurrences, 637 distinct full URLs, and 616 distinct URL paths. Repeated references are deduplicated by ImageKit source path for copying, then replaced across every matching document. A later attempt to refresh this inventory was blocked by ImageKit returning `Quota exceeded`; the default script did not use `--apply`, and no remote data was changed.

Other project references:

- The three catalog feeds `fb.xml`, `google.xml`, and `tt.xml` contain 10,797 ImageKit URL occurrences total. The prior scan found 522 URLs / 503 paths in `fb.xml`, 537 / 517 in `google.xml`, and 537 / 517 in `tt.xml`.
- Six distinct hard-coded ImageKit URLs remain in source code (payment marks and the policy logo). They are eligible for rewrite only after the corresponding original has been copied and byte-verified.
- Customer review photo upload remains supported through the new `/api/media` endpoint.

## ImageKit library and unresolved references

The prior ImageKit Media Library enumeration found 721 files with 721 unique paths. Six Firestore/source paths were not returned by the library listing and did not match authenticated exact-name queries:

```text
/WIND_Shopping/womens-turtleneck-pullover-img-11_qr7FRJjJ8.jpg
/WIND_Shopping/womens-turtleneck-pullover-img-5_0hMlE-vNx.jpg
/WIND_Shopping/womens-turtleneck-pullover-img-0_XP078yE7N.jpg
/WIND_Shopping/womens-turtleneck-pullover-img-3_Wuu2PVwZm.jpg
/WIND-Shopping/wind_1792783928077_6_20f2363e_ef2a_4d4e_a57f_59cbeebb1d43_sXjqd_A3E.webp
/WIND_Shopping/womens-turtleneck-pullover-img-12_vcP868Opp.jpg
```

Direct CDN retrieval attempts received HTTP 429 in this environment. Thus those six sources are unresolved, not proven deleted. Their Firestore references must remain unchanged unless the originals can be recovered or re-uploaded and explicitly mapped. Full migration and source/feed rewrite must remain marked incomplete until resolved.

## R2 state and safety boundary

Cloudflare reports the custom domain and SSL active. The bucket contained one test JPEG object (3,487,897 bytes) at the last read-only check; leave it untouched. No migration `--apply`, Firestore write, live R2 object write, deployment, push, or ImageKit deletion has been performed. The local migration script defaults to dry-run and never deletes ImageKit originals.

The script copies each source to a deterministic `legacy/imagekit/...` key, compares byte counts and SHA-256 hashes against the public R2 object, and only then transactionally updates matching Firestore references. It records JSONL events and resumable state under ignored `work/imagekit-r2-migration`. Copy verification and Firestore reference progress are checkpointed separately; a verified copy is not downloaded or uploaded again when a later reference update needs retry. Every run refreshes pending reference paths from the current Firestore scan; prior completed-document records do not suppress a current ImageKit reference. `--limit` selects the next pending files while skipping verified files with no currently scanned legacy references. Existing matching objects are revalidated when no successful checkpoint exists; conflicting objects fail closed. It can rewrite local source/feed URLs only when the full library completed without unresolved paths or failures.

## Credentials and remaining verification

Firestore collection enumeration (including subcollections) requires Firebase Admin credentials even for the read-only dry-run. This checkout has no Firebase Admin credential or R2 S3 credentials configured, so an apply run is not currently possible here. The last attempt to refresh the live inventory stopped before any writes when ImageKit returned `Quota exceeded`. The migration script should first be rerun in default dry-run mode after ImageKit API quota is available. Then configure the required Firebase Admin and R2 S3 credentials locally, dry-run again, and process a small `--limit` batch before the full resumable run.

The existing `GET /api/upload` ImageKit authentication route is retained for compatibility during the transition. New product and review uploads use `/api/media`; old ImageKit URLs remain displayable because the ImageKit domain is preserved in Next image configuration. Retire the old auth route only after deployed clients are confirmed to use the new endpoint.

WebP conversion is intentionally deferred. The migration copies original bytes unchanged so the archive remains lossless relative to ImageKit. Workers-compatible image encoding and visual quality/size comparisons need a separately validated stage; no assumption is made that native `sharp` works in Workers.
