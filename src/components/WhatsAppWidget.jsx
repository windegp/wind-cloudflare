'use client';

import { useState, useEffect, useCallback } from 'react';

// رقم الواتساب بصيغة دولية (بدون + وبدون صفر أول)
const WA_NUMBER = '201055351494';

export default function WhatsAppWidget() {
  const [isOpen, setIsOpen] = useState(false);

  const toggleChat = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  // إرسال الرسالة - الرابط هو نفس رابط الصفحة الحالية بالظبط بدون أي تعديل
  const sendMessage = useCallback((quickReplyText) => {
    const currentUrl = window.location.href; // نفس اللينك اللي العميل واقف فيه بالظبط

    const text = quickReplyText
      ? `${quickReplyText}\n\n${currentUrl}`
      : `مرحباً، أود الاستفسار عن:\n\n${currentUrl}`;

    const encodedText = encodeURIComponent(text);
    const url = `https://wa.me/${WA_NUMBER}?text=${encodedText}`;

    window.open(url, '_blank', 'noopener,noreferrer');
    setIsOpen(false);
  }, []);

  // إغلاق عند الضغط برة الصندوق
  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e) => {
      const box = document.querySelector('.wa-chat-box');
      if (box && !box.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [isOpen]);

  return (
    <div className="wa-chat-box">
      <style>{`
        .wa-chat-box {
          position: fixed;
          bottom: 56px;
          right: 25px; /* بقى يمين */
          z-index: 9999;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .wa-chat-button {
          width: 50px; height: 50px;
          background: linear-gradient(135deg, #25d366 0%, #128c7e 100%);
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(37, 211, 102, 0.4);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
        }
        .wa-chat-button:hover { transform: scale(1.1); box-shadow: 0 6px 20px rgba(37, 211, 102, 0.6); }
        .wa-chat-button:active { transform: scale(0.96); }
        .wa-chat-button svg { width: 28px; height: 28px; fill: #fff; }
        .wa-pulse {
          position: absolute; width: 50px; height: 50px; border-radius: 50%;
          background: rgba(37, 211, 102, 0.4);
          animation: wa-pulse-animation 2s infinite;
        }
        @keyframes wa-pulse-animation { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(1.5); opacity: 0; } }

        .wa-chat-popup {
          position: absolute;
          bottom: 75px;
          right: 0; /* يفتح لجهة اليمين */
          width: 320px;
          background: #fff;
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
          opacity: 0;
          transform: scale(0.8) translateY(20px);
          pointer-events: none;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          overflow: hidden;
        }
        .wa-chat-popup.active { opacity: 1; transform: scale(1) translateY(0); pointer-events: all; }

        .wa-chat-header {
          background: linear-gradient(135deg, #25d366 0%, #128c7e 100%);
          padding: 20px; color: #fff; position: relative;
        }
        .wa-close-btn {
          position: absolute; top: 15px; left: 15px; /* اتنقل لليسار عشان الهيدر بقى RTL */
          width: 28px; height: 28px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: background 0.2s;
        }
        .wa-close-btn:hover { background: rgba(255, 255, 255, 0.3); }
        .wa-close-btn svg { width: 14px; height: 14px; fill: #fff; }

        .wa-agent { display: flex; align-items: center; gap: 12px; }
        .wa-agent-avatar {
          width: 50px; height: 50px; border-radius: 50%; background: #fff;
          display: flex; align-items: center; justify-content: center;
          font-size: 24px; border: 3px solid rgba(255, 255, 255, 0.3);
        }
        .wa-agent-info h3 { margin: 0; font-size: 16px; font-weight: 600; }
        .wa-agent-status { display: flex; align-items: center; gap: 6px; font-size: 13px; margin-top: 4px; opacity: 0.95; }
        .wa-status-dot { width: 8px; height: 8px; background: #4ade80; border-radius: 50%; animation: wa-blink 2s infinite; }
        @keyframes wa-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

        .wa-chat-body { padding: 20px; }
        .wa-message {
          background: #f0f0f0; padding: 12px 16px; border-radius: 8px;
          font-size: 14px; line-height: 1.5; color: #333; margin-bottom: 16px;
          position: relative; direction: rtl; text-align: right;
        }
        .wa-message::before {
          content: ''; position: absolute; top: 0; right: -8px; /* المؤشر بقى ع اليمين */
          width: 0; height: 0; border-style: solid;
          border-width: 0 0 8px 8px;
          border-color: transparent transparent transparent #f0f0f0;
        }

        .wa-quick-replies { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
        .wa-quick-reply {
          padding: 10px 14px; background: #fff; border: 1px solid #e5e5e5;
          border-radius: 8px; font-size: 13px; color: #333;
          cursor: pointer; transition: all 0.2s; text-align: right; direction: rtl;
        }
        .wa-quick-reply:hover { background: #f9f9f9; border-color: #25d366; color: #25d366; }

        .wa-start-btn {
          width: 100%; padding: 14px;
          background: linear-gradient(135deg, #25d366 0%, #128c7e 100%);
          color: #fff; border: none; border-radius: 8px;
          font-size: 15px; font-weight: 600; cursor: pointer;
          transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .wa-start-btn:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(37, 211, 102, 0.3); }
        .wa-start-btn svg { width: 20px; height: 20px; fill: #fff; }

        .wa-footer {
          padding: 12px 20px; background: #f9f9f9; text-align: center;
          font-size: 11px; color: #999; border-top: 1px solid #e5e5e5;
        }

        @media screen and (max-width: 480px) {
          .wa-chat-box { right: 25px; bottom: 56px; }
          .wa-chat-popup { width: calc(100vw - 40px); right: 0; transform: scale(0.8) translateY(20px); }
          .wa-chat-popup.active { transform: scale(1) translateY(0); }
        }
      `}</style>

      <div className="wa-chat-button" onClick={toggleChat}>
        <div className="wa-pulse"></div>
        <svg viewBox="0 0 24 24">
          <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.463 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
        </svg>
      </div>

      <div className={`wa-chat-popup ${isOpen ? 'active' : ''}`}>
        <div className="wa-chat-header">
          <div className="wa-close-btn" onClick={toggleChat}>
            <svg viewBox="0 0 24 24">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </div>
          <div className="wa-agent">
            <div className="wa-agent-avatar">💬</div>
            <div className="wa-agent-info">
              <h3>فريق الدعم</h3>
              <div className="wa-agent-status">
                <span className="wa-status-dot"></span>
                <span>متاح الآن</span>
              </div>
            </div>
          </div>
        </div>

        <div className="wa-chat-body">
          <div className="wa-message">
            أهلاً بك! 👋<br />
            كيف يمكننا مساعدتك؟
          </div>

          <div className="wa-quick-replies">
            <div className="wa-quick-reply" onClick={() => sendMessage('🛍️ استفسار عن منتج')}>
              🛍️ استفسار عن منتج
            </div>
            <div className="wa-quick-reply" onClick={() => sendMessage('🚚 الاستفسار عن مواعيد التوصيل')}>
              🚚 مواعيد التوصيل
            </div>
            <div className="wa-quick-reply" onClick={() => sendMessage('📦 لدي مشكلة في الطلب')}>
              📦 مشكلة في الطلب
            </div>
            <div className="wa-quick-reply" onClick={() => sendMessage('💬 استفسار عام')}>
              💬 استفسار عام
            </div>
          </div>

          <button className="wa-start-btn" onClick={() => sendMessage()}>
            <svg viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
            ابدأ المحادثة
          </button>
        </div>

        <div className="wa-footer">سنرد عليك في أسرع وقت ⚡</div>
      </div>
    </div>
  );
}