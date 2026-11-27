"use client";

import { adminFetch } from "@/lib/adminFetch";
import { useState, useEffect, useCallback } from "react";
import {
  ASSIGNABLE_ROLES,
  ROLE_DESCRIPTIONS_AR,
  ROLE_LABELS_AR,
  ROLES,
} from "@/lib/rbac";

export const dynamic = "force-dynamic";

const ERROR_AR = {
  invalid_uid: "الـ UID غير صالح.",
  invalid_email: "البريد الإلكتروني غير صالح.",
  invalid_role: "الدور غير صالح.",
  cannot_modify_owner: "لا يمكن تعديل المالك من هنا.",
  cannot_deactivate_self: "لا يمكنك إلغاء تفعيل نفسك.",
  member_not_found: "العضو غير موجود.",
  members_list_failed: "فشل تحميل الأعضاء.",
  members_save_failed: "فشل حفظ العضو.",
  members_deactivate_failed: "فشل إلغاء التفعيل.",
  unauthorized: "غير مصرّح — سجّل الدخول من جديد.",
  forbidden_missing_permission: "لا تملك صلاحية إدارة الأعضاء.",
};

function RoleBadge({ role }) {
  const color =
    role === ROLES.OWNER
      ? "bg-[#1a1a1a] text-white"
      : role === ROLES.ADMIN
        ? "bg-blue-50 text-blue-600"
        : role === ROLES.VIEWER
          ? "bg-gray-100 text-gray-500"
          : "bg-emerald-50 text-emerald-600";
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${color}`}>
      {ROLE_LABELS_AR[role] || role}
    </span>
  );
}

export default function MembersPage() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [formError, setFormError] = useState("");

  const [uid, setUid] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState(ROLES.VIEWER);

  // الدور الجاري تعديله لكل عضو (افتراضيًا دوره الحالي).
  const [roleDrafts, setRoleDrafts] = useState({});
  const [confirmDeactivate, setConfirmDeactivate] = useState(null);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/members", { cache: "no-store" });
      const result = await res.json();
      if (result.success) {
        setMembers(result.members || []);
        const drafts = {};
        for (const m of result.members || []) drafts[m.uid] = m.role;
        setRoleDrafts(drafts);
      } else {
        setToast({ type: "error", text: ERROR_AR[result.error] || "فشل تحميل الأعضاء." });
      }
    } catch {
      setToast({ type: "error", text: "فشل تحميل الأعضاء." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  async function saveMember(e) {
    e.preventDefault();
    setFormError("");
    if (!uid.trim() || !email.trim()) {
      setFormError("الـ UID والبريد الإلكتروني مطلوبان.");
      return;
    }
    setSaving(true);
    try {
      const res = await adminFetch("/api/admin/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: uid.trim(), email: email.trim(), name: name.trim(), role, active: true }),
      });
      const result = await res.json();
      if (result.success) {
        setToast({ type: "success", text: "تم حفظ العضو بنجاح." });
        setUid("");
        setEmail("");
        setName("");
        setRole(ROLES.VIEWER);
        loadMembers();
      } else {
        setFormError(ERROR_AR[result.error] || "فشل حفظ العضو.");
      }
    } catch {
      setFormError("فشل حفظ العضو.");
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(member) {
    const newRole = roleDrafts[member.uid];
    if (!newRole || newRole === member.role) return;
    setSaving(true);
    try {
      const res = await adminFetch("/api/admin/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: member.uid,
          email: member.email,
          name: member.name,
          role: newRole,
          active: member.active,
        }),
      });
      const result = await res.json();
      if (result.success) {
        setToast({ type: "success", text: "تم تغيير الدور بنجاح." });
        loadMembers();
      } else {
        setToast({ type: "error", text: ERROR_AR[result.error] || "فشل تغيير الدور." });
      }
    } catch {
      setToast({ type: "error", text: "فشل تغيير الدور." });
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(member) {
    setSaving(true);
    try {
      if (member.active) {
        const res = await adminFetch("/api/admin/members", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid: member.uid }),
        });
        const result = await res.json();
        if (result.success) {
          setToast({ type: "success", text: "تم إلغاء تفعيل العضو." });
          loadMembers();
        } else {
          setToast({ type: "error", text: ERROR_AR[result.error] || "فشل إلغاء التفعيل." });
        }
      } else {
        const res = await adminFetch("/api/admin/members", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uid: member.uid,
            email: member.email,
            name: member.name,
            role: member.role,
            active: true,
          }),
        });
        const result = await res.json();
        if (result.success) {
          setToast({ type: "success", text: "تمت إعادة تفعيل العضو." });
          loadMembers();
        } else {
          setToast({ type: "error", text: ERROR_AR[result.error] || "فشلت إعادة التفعيل." });
        }
      }
    } catch {
      setToast({ type: "error", text: "حدث خطأ." });
    } finally {
      setSaving(false);
      setConfirmDeactivate(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#f4f6f8] p-4 sm:p-8 font-sans" dir="rtl">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-black text-[#202223] mb-2">إدارة الأعضاء</h1>
        <p className="text-gray-500 text-sm mb-6">
          أضف موظفين للوحة التحكم وحدّد دور كل واحد. المالك فقط يستطيع رؤية هذه الصفحة.
        </p>

        <div className="mb-4 p-3 rounded-xl text-sm bg-amber-50 text-amber-800 border border-amber-100 leading-relaxed">
          تنبيه: الدور هنا يتحكم في ظهور الأقسام وفي الـ APIs المحمية فقط. صفحات اللوحة
          بتحفظ في قاعدة البيانات مباشرة من المتصفح، وقواعد Firestore الحالية بتسمح
          بالكتابة للمالك فقط، فأي موظف هيقدر يشوف ويفتح الأقسام لكن الحفظ/التعديل
          ممكن يتعطل (permission-denied) لحد ما كتابات اللوحة تتحوّل لمسارات سيرفر.
          لا تعد موظفًا بصلاحية تعديل قبل ما يتأكد ده.
        </div>

        {toast && (
          <div
            className={`mb-4 p-3 rounded-xl text-sm font-bold ${
              toast.type === "success"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                : "bg-red-50 text-red-600 border border-red-100"
            }`}
          >
            {toast.text}
          </div>
        )}

        {/* كيف تضيف موظفًا؟ */}
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 mb-6 text-sm text-amber-900 leading-relaxed">
          <p className="font-bold mb-1">قبل إضافة أي موظف:</p>
          <p>
            يجب أن يسجّل الموظف دخوله مرة واحدة بحساب Google على صفحة{" "}
            <span className="font-mono font-bold" dir="ltr">/admin/login</span>{" "}
            حتى يُنشأ حساب Firebase الخاص به (سيظهر له "غير مصرح لك" — وهذا متوقَّع).
            بعدها انسخ الـ UID الخاص به من Firebase Console ← Authentication ←
            Users، والصقه في الحقل بالأسفل.
          </p>
        </div>

        {/* نموذج الإضافة */}
        <form
          onSubmit={saveMember}
          className="bg-white border border-gray-200 rounded-2xl p-5 mb-6 shadow-sm space-y-4"
        >
          <h2 className="font-bold text-[#202223]">إضافة عضو جديد</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-bold text-gray-600">Firebase UID *</span>
              <input
                value={uid}
                onChange={(e) => setUid(e.target.value)}
                dir="ltr"
                placeholder="مثال: AbC123xYz..."
                className="mt-1 w-full border border-gray-300 rounded-xl px-3 py-2 text-sm font-mono"
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-gray-600">البريد الإلكتروني *</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                dir="ltr"
                placeholder="name@example.com"
                className="mt-1 w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-gray-600">الاسم</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="اسم الموظف"
                className="mt-1 w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-gray-600">الدور</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white"
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS_AR[r]} — {ROLE_DESCRIPTIONS_AR[r]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {formError && <p className="text-red-600 text-sm font-bold">{formError}</p>}
          <button
            type="submit"
            disabled={saving}
            className="py-3 px-6 bg-[#1a1a1a] text-white font-bold rounded-xl hover:bg-black shadow-sm transition-colors disabled:opacity-50"
          >
            {saving ? "جارٍ الحفظ..." : "إضافة العضو"}
          </button>
        </form>

        {/* جدول الأعضاء */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-bold text-[#202223]">الأعضاء ({members.length})</h2>
            <button
              onClick={loadMembers}
              disabled={loading}
              className="text-sm font-bold text-gray-600 hover:text-black disabled:opacity-50"
            >
              تحديث
            </button>
          </div>

          {loading ? (
            <p className="p-6 text-gray-500 text-sm">جارٍ التحميل...</p>
          ) : members.length === 0 ? (
            <p className="p-6 text-gray-500 text-sm">لا يوجد أعضاء بعد.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {members.map((m) => (
                <li key={m.uid} className="p-4 sm:p-5 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-[#202223]">{m.name || "بدون اسم"}</span>
                    <RoleBadge role={m.role} />
                    {m.active ? (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-600">نشط</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-50 text-red-500">معطّل</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 break-all" dir="ltr">{m.email}</p>
                  <p className="text-xs text-gray-400 break-all font-mono" dir="ltr">{m.uid}</p>

                  {!m.isOwner && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <select
                        value={roleDrafts[m.uid] || m.role}
                        onChange={(e) =>
                          setRoleDrafts((d) => ({ ...d, [m.uid]: e.target.value }))
                        }
                        disabled={saving}
                        className="border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white"
                      >
                        {ASSIGNABLE_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS_AR[r]}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => changeRole(m)}
                        disabled={saving || (roleDrafts[m.uid] || m.role) === m.role}
                        className="py-2 px-4 bg-white border border-gray-300 text-[#202223] font-bold rounded-xl text-sm hover:bg-gray-50 disabled:opacity-50"
                      >
                        حفظ الدور
                      </button>
                      {confirmDeactivate === m.uid ? (
                        <>
                          <button
                            onClick={() => toggleActive(m)}
                            disabled={saving}
                            className="py-2 px-4 bg-red-600 text-white font-bold rounded-xl text-sm disabled:opacity-50"
                          >
                            تأكيد الإلغاء
                          </button>
                          <button
                            onClick={() => setConfirmDeactivate(null)}
                            className="py-2 px-4 text-sm font-bold text-gray-600"
                          >
                            تراجع
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() =>
                            m.active ? setConfirmDeactivate(m.uid) : toggleActive(m)
                          }
                          disabled={saving}
                          className={`py-2 px-4 font-bold rounded-xl text-sm disabled:opacity-50 ${
                            m.active
                              ? "bg-red-50 text-red-600 hover:bg-red-100"
                              : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          }`}
                        >
                          {m.active ? "إلغاء التفعيل" : "إعادة التفعيل"}
                        </button>
                      )}
                    </div>
                  )}
                  {m.isOwner && (
                    <p className="text-xs text-gray-400">
                      المالك — لا يمكن تعديله أو إلغاء تفعيله من هنا.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* شرح الأدوار */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 mt-6 shadow-sm">
          <h2 className="font-bold text-[#202223] mb-3">ماذا يستطيع كل دور؟</h2>
          <ul className="space-y-2 text-sm text-gray-600">
            {Object.values(ROLES).map((r) => (
              <li key={r}>
                <span className="font-bold text-[#202223]">{ROLE_LABELS_AR[r]}:</span>{" "}
                {ROLE_DESCRIPTIONS_AR[r]}
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-400 mt-4">
            إلغاء التفعيل يمنع الدخول فورًا، لكنه لا يحذف السجل — ويمكن إعادة
            التفعيل في أي وقت. إزالة عضو نهائيًا تتم من Firebase Console ←
            Authentication بحذف المستخدم.
          </p>
        </div>
      </div>
    </div>
  );
}
