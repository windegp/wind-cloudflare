"use client";
import { getAuthInstance } from "@/lib/firebase";
import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ADMIN_UID } from "@/lib/constants";

export const dynamic = 'force-dynamic';

export default function AdminLogin() {
  const [user, setUser] = useState(null);
  const router = useRouter();
  const auth = getAuthInstance();

  useEffect(() => {
    // مراقبة حالة المستخدم
    const unsubscribe = auth.onAuthStateChanged((u) => {
      // Check if user is the hardcoded admin UID
      if (u && u.uid === ADMIN_UID) {
        setUser(u);
      } else if (u) {
        // User is authenticated but not admin - sign them out
        signOut(auth);
        setUser(null);
      } else {
        setUser(null);
      }
    });
    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      // Check if authenticated user is the hardcoded admin
      if (user.uid === ADMIN_UID) {
        alert("تم تسجيل الدخول بنجاح! يمكنك الآن الإضافة والحذف.");
        router.push("/admin"); // توجيهك للوحة التحكم بعد الدخول
      } else {
        // User is not admin - sign them out
        await signOut(auth);
        alert("غير مصرح لك بالوصول إلى لوحة التحكم.");
      }
    } catch (error) {
      console.error("Login error:", error);
      alert("فشل تسجيل الدخول: " + error.message);
    }
  };

  const logout = () => signOut(auth);

  return (
    <div className="min-h-screen bg-[#f4f6f8] flex items-center justify-center p-4 font-sans" dir="rtl">
      <div className="max-w-md w-full bg-white border border-gray-200 p-8 rounded-2xl text-center shadow-sm">
        
        {/* الشعار */}
        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-200">
          <h1 className="text-xl font-black text-[#202223] tracking-tighter">WIND</h1>
        </div>
        <h2 className="text-xl font-bold text-[#202223] mb-6">لوحة الإدارة</h2>
        
        {user ? (
          <div className="space-y-4 animate-[fadeIn_0.3s_ease-out]">
            <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl">
              <p className="text-[#202223] font-medium text-sm">مرحباً، {user.displayName}</p>
              <p className="text-xs text-gray-500 break-all mt-1">{user.uid}</p>
            </div>
            
            <button 
              onClick={() => router.push("/admin")}
              className="w-full py-3 bg-[#1a1a1a] text-white font-bold rounded-xl hover:bg-black shadow-sm transition-colors"
            >
              الذهاب للوحة التحكم
            </button>
            <button onClick={logout} className="text-red-600 font-bold text-sm hover:underline mt-2 inline-block">تسجيل الخروج</button>
          </div>
        ) : (
          <div className="space-y-6 animate-[fadeIn_0.3s_ease-out]">
            <p className="text-gray-500 text-sm leading-relaxed">يجب تسجيل الدخول بصفتك المدير لتتمكن من إدارة المتجر وتعديل البيانات.</p>
            
            <button 
              onClick={loginWithGoogle}
              className="w-full py-3 bg-white border border-gray-300 text-[#202223] font-bold rounded-xl flex items-center justify-center gap-3 hover:bg-gray-50 shadow-sm transition-colors"
            >
              <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="google" />
              الدخول باستخدام حساب Google
            </button>
          </div>
        )}
      </div>
      
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}