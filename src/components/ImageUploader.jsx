"use client";
import React, { useState } from 'react';
import { ImageIcon, Loader2, CheckCircle2 } from '@/components/icons-extra';

export default function ImageUploader({ onUploadSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadCount, setUploadCount] = useState(0);

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (!files || files.length === 0) return;

    setLoading(true);
    setError(null);
    setUploadCount(files.length);

    try {
      // 1. جلب التوكن (مرة واحدة للكل الملفات)
      const authRes = await fetch('/api/upload'); 
      if (!authRes.ok) throw new Error("Auth Failed");
      const authData = await authRes.json();

      // 2. تجهيز عمليات الرفع لكل صورة
      const uploadPromises = files.map(async (file) => {
        try {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("fileName", `wind_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
          formData.append("publicKey", process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY);
          formData.append("signature", authData.signature);
          formData.append("expire", authData.expire);
          formData.append("token", authData.token);
          formData.append("folder", "/WIND_Shopping/Reviews");

          const uploadRes = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
            method: "POST",
            body: formData,
          });

          if (!uploadRes.ok) {
            const errorData = await uploadRes.text();
            console.error("ImageKit upload failed:", uploadRes.status, errorData);
            return null;
          }

          const data = await uploadRes.json();
          return data.url || null;
         } catch (err) {
          console.error("Error uploading file:", file.name, err);
          return null;
         }
       });

      const results = await Promise.all(uploadPromises);
      const successfulUrls = results.filter(url => url !== null);

      if (successfulUrls.length > 0) {
        onUploadSuccess(successfulUrls);
      }

      if (successfulUrls.length < files.length) {
        setError(`تم رفع ${successfulUrls.length} من أصل ${files.length} صورة.`);
      }

    } catch (err) {
      setError("حدث خطأ أثناء معالجة الصور.");
    } finally {
      setLoading(false);
      e.target.value = null; 
    }
  };

  return (
    <div className="w-full">
      <label 
        className={`
          relative flex flex-col items-center justify-center w-full min-h-[120px] 
          border-2 border-dashed rounded-2xl transition-all duration-300 group
          ${loading ? 'bg-gray-50 border-gray-200 cursor-wait' : 'bg-white border-[#EAEAEA] hover:border-[#1A1A1A] cursor-pointer'}
        `}
      >
        <input 
          type="file" 
          accept="image/*" 
          multiple 
          className="hidden" 
          onChange={handleFileChange} 
          disabled={loading}
        />

        <div className="flex flex-col items-center justify-center p-6 text-center">
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-[#1A1A1A]" />
              <p className="text-sm font-bold text-[#1A1A1A] font-cairo">جاري رفع {uploadCount} صور...</p>
            </div>
          ) : (
            <>
              <div className="w-12 h-12 mb-3 bg-[#FAF9F6] rounded-full flex items-center justify-center group-hover:bg-[#1A1A1A] group-hover:text-white transition-colors duration-300">
                <ImageIcon size={22} strokeWidth={1.5} />
              </div>
              <p className="text-sm font-bold text-[#1A1A1A] font-cairo mb-1">اضغط لإضافة صور</p>
              <p className="text-[11px] text-gray-400 font-tajawal">يمكنك اختيار أكثر من صورة معاً</p>
            </>
          )}
        </div>

        {/* Overlay بسيط للنجاح */}
        {!loading && !error && uploadCount > 0 && (
           <div className="absolute top-2 right-2 text-green-500 animate-bounce">
             <CheckCircle2 size={18} />
           </div>
        )}
      </label>

      {error && (
        <p className="mt-3 text-[11px] font-bold text-red-500 bg-red-50 p-2 rounded-lg text-center font-cairo border border-red-100">
          {error}
        </p>
      )}
    </div>
  );
}