// تسجيل زيارة اليوم: مستند visitor_events غير قابل للتعديل + عدادات settings/siteSettings.
// بعد قفل قراءة visitor_events بقواعد Firestore، فحص الوجود (getDoc) بيرفض
// permission-denied. ساعتها بنتعامل مع الزيارة كأنها جديدة ونحاول الإنشاء مباشرة:
// الإنشاء مسموح في القواعد قبل القفل وبعده، ولو المستند موجود أصلاً setDoc
// بيرفض بأمان (update ممنوع) من غير ما يأثر على العدادات.
// تحت القواعد الحالية (القراءة مفتوحة) المسار ده لا يتفعّل إطلاقاً.
export function createVisitorRecorder({ db, doc, getDoc, setDoc, updateDoc, increment, now, log = console }) {
  const writeEventAndCounters = ({ sessionId, todayStr, page, context, markCounted }) => {
    const visitorEventRef = doc(db, "visitor_events", `${sessionId}_${todayStr}`);

    // [1] كتابة مستند الحدث (مستقلة عن العدادات)
    const visitorEventPromise = setDoc(visitorEventRef, {
      sessionId: sessionId,
      date: todayStr,
      visitedAt: now(),
      country: '',
      city: '',
      device: context.device || '',
      userAgent: context.userAgent || '',
      referrer: context.referrer || '',
      page: page || '/',
    }).then(() => {
      log.log("[VisitorEvent] ✅ setDoc SUCCEEDED for:", visitorEventRef.id);
    }).catch(err => {
      log.error("[VisitorEvent] ❌ setDoc FAILED:", err.message, err.code || "");
    });

    // [2] تحديث العدادات (مستقل، بيشتغل دايماً)
    const counterPromise = (async () => {
      const settingsRef = doc(db, "settings", "siteSettings");
      try {
        const snap = await getDoc(settingsRef);
        if (snap.exists()) {
          const currentCounters = snap.data().counters || {};
          const storedTodayDate = currentCounters.todayDate || '';
          const updates = {
            "counters.visitors": increment(1),
          };
          if (storedTodayDate === todayStr) {
            updates["counters.todayVisitors"] = increment(1);
          } else {
            // أول زائر في يوم جديد: نبدأ العداد من 1 (قيمة ثابتة وليس increment)،
            // وإلا يتراكم عدد اليوم فوق مجموع الأيام السابقة.
            updates["counters.yesterdayVisitors"] = storedTodayDate ? (Number(currentCounters.todayVisitors) || 0) : 0;
            updates["counters.todayVisitors"] = 1;
            updates["counters.todayDate"] = todayStr;
          }
          await updateDoc(settingsRef, updates);
        } else {
          await updateDoc(settingsRef, {
            "counters.visitors": increment(1),
            "counters.todayVisitors": 1,
            "counters.todayDate": todayStr,
          });
        }
      } catch (err) {
        log.warn("[VisitorEvent] counter update failed:", err.message);
        // Last-resort attempt: increment visitors only
        try {
          await updateDoc(doc(db, "settings", "siteSettings"), {
            "counters.visitors": increment(1),
          });
        } catch (e) {
          log.warn("[VisitorEvent] fallback counter increment failed:", e.message);
        }
      }
    })();

    // [3] علّم الجلسة كمتسجلة بعد انتهاء كتابة الحدث فقط (نجاحاً أو فشلاً)
    // لمنع إعادة المحاولة اللانهائية مع كل تحميل صفحة.
    visitorEventPromise.finally(() => {
      markCounted();
    });

    return Promise.allSettled([visitorEventPromise, counterPromise]);
  };

  return async function recordVisitor({ sessionId, todayStr, page, context = {}, markCounted }) {
    const visitorEventRef = doc(db, "visitor_events", `${sessionId}_${todayStr}`);
    try {
      const snap = await getDoc(visitorEventRef);
      if (!snap.exists()) {
        await writeEventAndCounters({ sessionId, todayStr, page, context, markCounted });
      } else {
        // المستند موجود لهذه الجلسة واليوم — نكتفي بعلامة التسجيل
        markCounted();
      }
    } catch (err) {
      if (err && err.code === "permission-denied") {
        // قراءة visitor_events مقفولة بالقواعد: لا نستطيع فحص الوجود،
        // فنحاول تسجيل الزيارة كأنها جديدة — الإنشاء مسموح، ولو المستند
        // موجود سيرفض setDoc بأمان وتظل العدادات صحيحة لمرة واحدة لكل جلسة.
        await writeEventAndCounters({ sessionId, todayStr, page, context, markCounted });
      } else {
        log.warn("[VisitorEvent] getDoc check failed:", err.message);
        markCounted();
        try {
          await updateDoc(doc(db, "settings", "siteSettings"), { "counters.visitors": increment(1) });
        } catch (err2) {
          log.warn("[VisitorEvent] fallback counter increment failed:", err2.message);
        }
      }
    }
  };
}
