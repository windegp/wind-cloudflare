"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getDb } from "../lib/firebase";
import { doc, getDoc } from "firebase/firestore/lite";
import "../lib/firebase"; // التأكد من عمل initialize للفايربيز

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null); // بيانات المستخدم الأساسية من Auth
  const [userData, setUserData] = useState(null); // البيانات الإضافية من Firestore (مثل الـ Role)
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getAuth();
    // مراقب حالة التسجيل - بيشتغل مرة واحدة ويفضل مراقب
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        // جلب بياناته الإضافية (مثل لو هو آدمن) من كولكشن Users
        try {
          const userDoc = await getDoc(doc(getDb(), "Users", firebaseUser.uid));
          if (userDoc.exists()) {
            setUserData(userDoc.data());
          }
        } catch (error) {
          console.error("WIND Auth Error:", error);
        }
      } else {
        setUser(null);
        setUserData(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, userData, loading, isAdmin: userData?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);