"use client";
import { useState, useEffect, useCallback } from 'react';
import { getDb } from '@/lib/firebase';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { TrendingUp, ShoppingCart, Activity, Users } from '@/components/icons-extra';

const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

const PERIODS = [
  { key: 'today',     label: 'اليوم' },
  { key: 'thisMonth', label: 'هذا الشهر' },
  { key: 'lastMonth', label: 'الشهر الماضي' },
  { key: 'shopify',   label: 'ديس ٢٥ – فبر ٢٦' },
  { key: 'all',       label: 'الكل' },
];

function getDateRange(period, customStart, customEnd) {
  const now = new Date();
  switch (period) {
    case 'today': {
      const yesterday = new Date(now - 86400000);
      return {
        start: fmtDate(now) + ' 00:00:00',
        end:   fmtDate(now) + ' 23:59:59',
        prevStart: fmtDate(yesterday) + ' 00:00:00',
        prevEnd:   fmtDate(yesterday) + ' 23:59:59',
      };
    }
    case 'thisMonth': {
      const start   = new Date(now.getFullYear(), now.getMonth(), 1);
      const prevEnd = new Date(start - 1);
      const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), 1);
      return {
        start: fmtDate(start) + ' 00:00:00',
        end:   fmtDate(now)   + ' 23:59:59',
        prevStart: fmtDate(prevStart) + ' 00:00:00',
        prevEnd:   fmtDate(prevEnd)   + ' 23:59:59',
      };
    }
    case 'lastMonth': {
      const end   = new Date(now.getFullYear(), now.getMonth(), 0);
      const start = new Date(end.getFullYear(), end.getMonth(), 1);
      const prevEnd   = new Date(start - 1);
      const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), 1);
      return {
        start: fmtDate(start) + ' 00:00:00',
        end:   fmtDate(end)   + ' 23:59:59',
        prevStart: fmtDate(prevStart) + ' 00:00:00',
        prevEnd:   fmtDate(prevEnd)   + ' 23:59:59',
      };
    }
    case 'shopify':
      return { start: '2025-12-01 00:00:00', end: '2026-02-28 23:59:59', prevStart: null, prevEnd: null };
    case 'custom':
      if (!customStart || !customEnd) return null;
      return { start: customStart + ' 00:00:00', end: customEnd + ' 23:59:59', prevStart: null, prevEnd: null };
    case 'all':
    default:
      return null;
  }
}

async function fetchPeriodStats(range) {
  const db = getDb();
  let q;

  if (range) {
    q = query(
      collection(db, 'Orders'),
      where('Created at', '>=', range.start),
      where('Created at', '<=', range.end),
      orderBy('Created at', 'desc'),
      limit(500)
    );
  } else {
    q = query(collection(db, 'Orders'), orderBy('Created at', 'desc'), limit(500));
  }

  const snap = await getDocs(q);
  let totalSales = 0;
  let orderCount = 0;
  const emails = new Set();

  snap.forEach(doc => {
    const d = doc.data();
    orderCount++;
    totalSales += parseFloat(d['Total'] || 0);
    if (d['Email']) emails.add(d['Email'].toLowerCase());
  });

  return { totalSales, orderCount, uniqueCustomers: emails.size };
}

function getDelta(current, prev) {
  if (!prev || prev === 0) return null;
  return ((current - prev) / prev * 100).toFixed(1);
}

function StatCard({ icon, label, value, delta, color }) {
  return (
    <div className="flex flex-col gap-2 p-4 rounded-xl bg-gray-50 border border-gray-100">
      <div className={`w-7 h-7 rounded-full ${color} flex items-center justify-center`}>{icon}</div>
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className="text-lg font-bold text-[#202223]" dir="ltr">{value}</p>
      {delta !== null && (
        <span className={`text-xs font-semibold ${parseFloat(delta) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
          {parseFloat(delta) >= 0 ? '↑' : '↓'} {Math.abs(parseFloat(delta))}% مقارنة بالفترة السابقة
        </span>
      )}
    </div>
  );
}

export default function PeriodStats({ liveVisitors = 0, shopifyVisitors = 30000 }) {
  const [period, setPeriod]           = useState('shopify');
  const [showCustom, setShowCustom]   = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd]     = useState('');
  const [stats, setStats]             = useState(null);
  const [prevStats, setPrevStats]     = useState(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);

  const load = useCallback(async (p) => {
    setLoading(true);
    setError(null);
    try {
      const range = getDateRange(p, customStart, customEnd);
      const current = await fetchPeriodStats(range);
      setStats(current);

      if (range?.prevStart) {
        const prev = await fetchPeriodStats({ start: range.prevStart, end: range.prevEnd });
        setPrevStats(prev);
      } else {
        setPrevStats(null);
      }
    } catch (e) {
      console.error('PeriodStats:', e);
      setError('تعذر تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [customStart, customEnd]);

  useEffect(() => { load(period); }, [period, load]);

  const conversionRate = () => {
    if (!stats || stats.orderCount === 0) return '--';
    const visitors =
      period === 'today'   ? liveVisitors :
      period === 'shopify' ? shopifyVisitors :
      period === 'all'     ? shopifyVisitors : 0;
    if (!visitors) return '--';
    return ((stats.orderCount / visitors) * 100).toFixed(2) + '%';
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {PERIODS.map(p => (
          <button key={p.key}
            onClick={() => { setPeriod(p.key); setShowCustom(false); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              period === p.key && !showCustom
                ? 'bg-[#008060] text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >{p.label}</button>
        ))}
        <button
          onClick={() => { setShowCustom(true); setPeriod('custom'); }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            showCustom ? 'bg-[#008060] text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >مخصص</button>
      </div>

      {/* Custom Range */}
      {showCustom && (
        <div className="flex flex-wrap gap-2 items-center">
          <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#008060]/20" />
          <span className="text-gray-400 text-sm">→</span>
          <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#008060]/20" />
          <button onClick={() => load('custom')}
            className="px-4 py-1.5 bg-[#008060] text-white rounded-lg text-sm font-medium hover:bg-[#006a50] transition-colors">
            عرض
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : error ? (
        <p className="text-sm text-red-500 text-center py-4">{error}</p>
      ) : stats ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={<TrendingUp size={15} className="text-green-600" />}
            label="المبيعات (EGP)"
            value={Number(stats.totalSales.toFixed(0)).toLocaleString()}
            delta={prevStats ? getDelta(stats.totalSales, prevStats.totalSales) : null}
            color="bg-green-50"
          />
          <StatCard
            icon={<ShoppingCart size={15} className="text-blue-600" />}
            label="الطلبات"
            value={stats.orderCount.toLocaleString()}
            delta={prevStats ? getDelta(stats.orderCount, prevStats.orderCount) : null}
            color="bg-blue-50"
          />
          <StatCard
            icon={<Users size={15} className="text-purple-600" />}
            label="عملاء فريدون"
            value={stats.uniqueCustomers.toLocaleString()}
            delta={null}
            color="bg-purple-50"
          />
          <StatCard
            icon={<Activity size={15} className="text-orange-500" />}
            label="معدل التحويل"
            value={conversionRate()}
            delta={null}
            color="bg-orange-50"
          />
        </div>
      ) : null}
    </div>
  );
}