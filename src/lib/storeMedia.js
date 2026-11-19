
"use client";

import { getAuthInstance } from "@/lib/firebase";
import { STORE_MEDIA_ORIGIN } from "@/lib/media-utils";

async function adminHeaders() {
  const user = getAuthInstance().currentUser;

  if (!user) {
    throw new Error("Admin login required.");
  }

  return {
    Authorization: `Bearer ${await user.getIdToken()}`,
  };
}

export async function uploadStoreImage(file, purpose = "review") {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("purpose", purpose);

  const headers = purpose === "product" ? await adminHeaders() : {};

  const response = await fetch("/api/media", {
    method: "POST",
    headers,
    body: formData,
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result.url) {
    throw new Error(result.error || "Image upload failed.");
  }

  return result.url;
}

export async function deleteStoreImage(url) {
  try {
    const parsed = new URL(url);

    let decodedPath;
    try { decodedPath = decodeURIComponent(parsed.pathname.slice(1)); } catch {
      return { success: true, skipped: true };
    }

    if (decodedPath.startsWith("products/migrated/")) {
      return { success: true, skipped: true, reason: "migration_archive_is_immutable" };
    }

    if (
      parsed.origin !== STORE_MEDIA_ORIGIN ||
      !(
        parsed.pathname.startsWith("/products/") ||
        parsed.pathname.startsWith("/uploads/products/")
      )
    ) {
      return { success: true, skipped: true };
    }

    const headers = await adminHeaders();

    const response = await fetch("/api/delete-image", {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || "Image deletion failed.");
    }

    return result;
  } catch (error) {
    console.error("R2 image deletion failed:", error);
    return { success: false, error };
  }
}
