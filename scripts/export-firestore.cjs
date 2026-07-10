const fs = require("fs");
const path = require("path");

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

// =======================================
// ضع هنا ملف Service Account
// =======================================

const serviceAccount = require("../serviceAccountKey.json");

// =======================================

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

async function exportCollection(collectionName) {
  console.log(`\n📦 Exporting ${collectionName}...`);

  const snapshot = await db.collection(collectionName).get();

  const data = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  const outputDir = path.join(__dirname, "../firestore-export");

  fs.mkdirSync(outputDir, {
    recursive: true,
  });

  const outputFile = path.join(
    outputDir,
    `${collectionName}.json`
  );

  fs.writeFileSync(
    outputFile,
    JSON.stringify(data, null, 2),
    "utf8"
  );

  console.log(
    `✅ ${collectionName}: ${data.length} documents exported`
  );
}

async function main() {
  try {
    console.log("==================================");
    console.log("🚀 Firestore Export Started");
    console.log("==================================");

    await exportCollection("products");
    await exportCollection("collections");

    console.log("\n==================================");
    console.log("✅ Export Finished Successfully");
    console.log("==================================");
  } catch (err) {
    console.error("\n❌ Export Failed");
    console.error(err);
    process.exitCode = 1;
  }
}

main();