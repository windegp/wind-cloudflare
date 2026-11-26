// تحديث ملف العميل بعد أوردر COD بدون أي قراءة من Firestore.
// قراءة Customers من المتصفح مقفولة بقواعد الأمان، فبنستخدم increment:
// بيزوّد العدادات في الملف الموجود، وبينشئ ملف مبسّط لو العميل جديد
// (بدون اسم ولا شريحة — بتتكمل من الأدمن أو مع المسار الدائم).
// فشل التحديث هنا لا يوقف الطلب: الأوردر بيتحفظ قبل الاستدعاء.
export async function applyCodCustomerProfileUpdate(
  { customerId, phone, city, governorate, total },
  { db, doc, setDoc, increment, now }
) {
  if (!customerId) return false;
  try {
    await setDoc(doc(db, "Customers", customerId), {
      "Total Orders": increment(1),
      "Total Spent": increment(Number(total)),
      Last_Order_Status: "New",
      data_source: "WIND_Web",
      Phone: phone || "",
      "Default Address City": city || "",
      "Default Address Province": governorate || "",
      hasAbandoned: false,
      last_active: now(),
    }, { merge: true });
    return true;
  } catch (error) {
    console.error("Error updating customer profile:", error);
    return false;
  }
}
