"use client";
import { useState, useEffect, useMemo, useCallback } from 'react';

const TOTAL_VISITORS_BASE = 30000;
const PERIOD_DAYS_BASE = 90;

function parseOrderDate(str) {
  if (!str) return null;
  const s = str.replace(/ \+\d{4}$/, '').trim();
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function getPeriodRange(period) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (period === 'this_month') return [new Date(y, m, 1), new Date(y, m + 1, 0, 23, 59, 59)];
  if (period === 'last_month') return [new Date(y, m - 1, 1), new Date(y, m, 0, 23, 59, 59)];
  if (period === 'dec_feb') return [new Date(2025, 11, 1), new Date(2026, 1, 28, 23, 59, 59)];
  if (period === 'all') return [new Date(2019, 0, 1), new Date(2030, 0, 1)];
  return null;
}

function filterValid(orders, from, to) {
  return orders.filter(o => {
    if (!o || o['Financial Status'] === 'deleted') return false;
    const isAbandoned =
      o['Financial Status'] === 'abandoned' ||
      o['Financial Status'] === 'pending_payment' ||
      (o.Name && String(o.Name).startsWith('DRAFT-'));
    if (isAbandoned) return false;
    const d = parseOrderDate(o['Created at']);
    return d && d >= from && d <= to;
  });
}

const PERIOD_LABELS = {
  this_month: 'هذا الشهر',
  last_month: 'الشهر الماضي',
  dec_feb: 'ديسمبر – فبراير',
  all: 'كل الوقت',
  custom: 'فترة مخصصة',
};

export default function PeriodStats({ totalVisitors = TOTAL_VISITORS_BASE }) {
  const [orders, setOrders] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [period, setPeriod] = useState('dec_feb');
  const [customFrom, setCustomFrom] = useState('2025-12-01');
  const [customTo, setCustomTo] = useState('2026-02-28');
  const [showCustom, setShowCustom] = useState(false);

  useEffect(() => {
    if (loaded) return;
    let cancelled = false;
    const run = async () => {
      try {
        const { getDb } = await import('@/lib/firebase');
        const fs = await import('firebase/firestore/lite');
        const db = getDb();
        const q = fs.query(
          fs.collection(db, 'Orders'),
          fs.orderBy('Created at', 'desc'),
          fs.limit(500)
        );
        const snap = await fs.getDocs(q);
        if (!cancelled) {
          setOrders(snap.docs.map(d => d.data()));
          setLoaded(true);
        }
      } catch (e) {
        console.error('PeriodStats fetch:', e);
        if (!cancelled) setLoaded(true);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [loaded]);

  const stats = useMemo(() => {
    if (!orders.length) return null;
    let from, to;
    if (period === 'custom') {
      if (!customFrom || !customTo) return null;
      from = new Date(customFrom);
      to = new Date(customTo + 'T23:59:59');
    } else {
      const range = getPeriodRange(period);
      if (!range) return null;
      [from, to] = range;
    }

    const filtered = filterValid(orders, from, to);
    const span = to - from;
    const prevFrom = new Date(from.getTime() - span);
    const prevTo = new Date(from.getTime() - 1);
    const prev = filterValid(orders, prevFrom, prevTo);

    const paid = filtered.filter(o =>
      o['Financial Status'] === 'paid' || o['Financial Status'] === 'fulfilled'
    );
    const totalSales = paid.reduce((s, o) => s + Number(o.Total || 0), 0);
    const aov = paid.length > 0 ? Math.round(totalSales / paid.length) : 0;
    const uniqueEmails = new Set(
      filtered.map(o => (o.Email || '').toLowerCase()).filter(Boolean)
    );
    const paidRate = filtered.length > 0
      ? Math.round((paid.length / filtered.length) * 100) : 0;

    const days = Math.max(1, Math.round(span / 86400000));
    const estVisitors = Math.round((days / PERIOD_DAYS_BASE) * totalVisitors);
    const cr = estVisitors > 0
      ? ((filtered.length / estVisitors) * 100).toFixed(1) : '—';

    const prevSales = prev
      .filter(o => o['Financial Status'] === 'paid' || o['Financial Status'] === 'fulfilled')
      .reduce((s, o) => s + Number(o.Total || 0), 0);

    return {
      orders: filtered.length,
      sales: Math.round(totalSales),
      aov,
      customers: uniqueEmails.size,
      paidRate,
      cr,
      estVisitors,
      diffOrders: filtered.length - prev.length,
      diffSales: Math.round(totalSales - prevSales),
      hasPrev: prev.length > 0,
    };
  }, [orders, period, customFrom, customTo, totalVisitors]);

  const cards = stats ? [
    {
      label: 'الطلبات',
      value: stats.orders.toLocaleString(),
      sub: stats.hasPrev
        ? `${stats.diffOrders >= 0 ? '+' : ''}${stats.diffOrders} من السابق`
        : null,
      color: stats.diffOrders >= 0 ? '#008060' : '#E24B4A',
    },
    {
      label: 'المبيعات',
      value: stats.sales.toLocaleString() + ' EGP',
      sub: stats.hasPrev
        ? `${stats.diffSales >= 0 ? '+' : ''}${stats.diffSales.toLocaleString()} EGP`
        : null,
      color: stats.diffSales >= 0 ? '#008060' : '#E24B4A',
    },
    {
      label: 'متوسط الطلب',
      value: stats.aov.toLocaleString() + ' EGP',
      sub: 'لكل طلب مدفوع',
      color: '#9ca3af',
    },
    {
      label: 'معدل التحويل',
      value: stats.cr + '%',
      sub: `${stats.orders} ÷ ~${stats.estVisitors.toLocaleString()}`,
      color: '#9ca3af',
    },
    {
      label: 'عملاء فريدون',
      value: stats.customers.toLocaleString(),
      sub: 'إيميل غير مكرر',
      color: '#9ca3af',
    },
    {
      label: 'نسبة الإتمام',
      value: stats.paidRate + '%',
      sub: 'طلبات مدفوعة',
      color: '#9ca3af',
    },
  ] : [];

  return (
    <div className="space-y-4 font-sans" dir="rtl">
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-2 shadow-sm">
        {Object.keys(PERIOD_LABELS).map(p => (
          <button
            key={p}
            onClick={() => { setPeriod(p); setShowCustom(p === 'custom'); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              period === p
                ? 'bg-[#008060] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
        {showCustom && (
          <div className="flex items-center gap-2 mt-2 w-full sm:w-auto sm:mt-0 flex-wrap">
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 outline-none focus:border-[#008060] bg-white text-[#202223]"
            />
            <span className="text-xs text-gray-400">إلى</span>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 outline-none focus:border-[#008060] bg-white text-[#202223]"
            />
          </div>
        )}
      </div>

      {!loaded && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center text-xs text-gray-400 animate-pulse">
          جاري حساب إحصائيات الفترة...
        </div>
      )}

      {loaded && !stats && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center text-xs text-gray-400">
          لا توجد طلبات في هذه الفترة
        </div>
      )}

      {loaded && stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {cards.map(card => (
            <div
              key={card.label}
              className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
            >
              <p className="text-xs text-gray-500 mb-1">{card.label}</p>
              <p className="text-base font-bold text-[#202223] leading-tight">{card.value}</p>
              {card.sub && (
                <p className="text-[10px] mt-1 font-medium" style={{ color: card.color }}>
                  {card.sub}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}