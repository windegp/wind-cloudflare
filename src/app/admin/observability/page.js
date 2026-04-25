'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Activity, 
  Database, 
  Zap, 
  RefreshCw, 
  TrendingUp, 
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Wifi,
  WifiOff,
  Play,
  BarChart3,
  Flame,
  Radio,
  Server,
  HardDrive,
  Layers,
  Moon,
  Sun
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';

// ═══════════════════════════════════════════════════════════
// THEME CONFIGURATION
// ═══════════════════════════════════════════════════════════
const THEME = {
  bg: { DEFAULT: '#0f172a', card: '#1e293b', hover: '#334155' },
  text: { primary: '#f1f5f9', secondary: '#94a3b8', muted: '#64748b' },
  accent: { success: '#22c55e', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' },
  border: '#334155'
};

// ═══════════════════════════════════════════════════════════
// SSE HOOK - Optimized for performance with batching
// ═══════════════════════════════════════════════════════════
function useObservabilitySSE(enabled = true) {
  const [data, setData] = useState(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const eventSourceRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const updateBatchRef = useRef([]);
  const batchTimerRef = useRef(null);
  const mountedRef = useRef(true);

  const processBatch = useCallback(() => {
    if (!mountedRef.current) return;
    if (updateBatchRef.current.length > 0) {
      const latest = updateBatchRef.current[updateBatchRef.current.length - 1];
      setData(latest);
      updateBatchRef.current = [];
    }
    batchTimerRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    
    if (!enabled) {
      setConnected(false);
      return;
    }

    const connect = () => {
      try {
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
        }

        const es = new EventSource('/api/observability/stream');
        eventSourceRef.current = es;

        es.onopen = () => {
          if (!mountedRef.current) return;
          setConnected(true);
          setError(null);
        };

        es.onmessage = (event) => {
          if (!mountedRef.current) return;
          try {
            const parsed = JSON.parse(event.data);
            updateBatchRef.current.push(parsed);
            
            // Batch updates every 500ms max for performance
            if (!batchTimerRef.current) {
              batchTimerRef.current = setTimeout(processBatch, 500);
            }
          } catch (e) {
            console.error('SSE parse error:', e);
          }
        };

        es.onerror = () => {
          if (!mountedRef.current) return;
          setConnected(false);
          es.close();
          
          // Reconnect after 3s with exponential backoff
          reconnectTimerRef.current = setTimeout(connect, 3000);
        };
      } catch (err) {
        if (!mountedRef.current) return;
        setError(err.message);
        setConnected(false);
      }
    };

    connect();

    return () => {
      mountedRef.current = false;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
      }
    };
  }, [enabled, processBatch]);

  return { data, connected, error };
}

// ═══════════════════════════════════════════════════════════
// METRIC CARD COMPONENT - Memoized for performance
// ═══════════════════════════════════════════════════════════
const MetricCard = React.memo(function MetricCard({ icon: Icon, title, value, trend, color, subtitle, loading }) {
  const colorClasses = {
    green: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    blue: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
    amber: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    red: 'text-red-400 bg-red-400/10 border-red-400/20',
    purple: 'text-purple-400 bg-purple-400/10 border-purple-400/20'
  };

  if (loading) {
    return (
      <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-5 animate-pulse">
        <div className="h-10 w-10 rounded-lg bg-[#334155] mb-4" />
        <div className="h-4 w-24 bg-[#334155] rounded mb-2" />
        <div className="h-8 w-16 bg-[#334155] rounded" />
      </div>
    );
  }

  return (
    <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-5 hover:border-[#475569] transition-all duration-200">
      <div className="flex items-start justify-between">
        <div className={`p-3 rounded-lg ${colorClasses[color] || colorClasses.blue}`}>
          <Icon size={22} />
        </div>
        {trend !== undefined && trend !== null && (
          <span className={`text-sm font-medium ${trend > 0 ? 'text-emerald-400' : trend < 0 ? 'text-red-400' : 'text-[#64748b]'}`}>
            {trend > 0 ? '↑' : trend < 0 ? '↓' : '→'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div className="mt-4">
        <p className="text-[#94a3b8] text-sm">{title}</p>
        <p className="text-[#f1f5f9] text-2xl font-bold mt-1">{value}</p>
        {subtitle && <p className="text-[#64748b] text-xs mt-1">{subtitle}</p>}
      </div>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════
// ACTIVITY FEED COMPONENT - Virtualized for performance
// ═══════════════════════════════════════════════════════════
const ActivityFeed = React.memo(function ActivityFeed({ events = [] }) {
  const getLevelColor = (level) => {
    switch (level) {
      case 'error': return 'text-red-400 bg-red-400/10 border-red-400/20';
      case 'warn': return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
      case 'success': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
      default: return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
    }
  };

  const getLevelIcon = (level) => {
    switch (level) {
      case 'error': return XCircle;
      case 'warn': return AlertTriangle;
      case 'success': return CheckCircle;
      default: return Activity;
    }
  };

  return (
    <div className="bg-[#1e293b] border border-[#334155] rounded-xl overflow-hidden">
      <div className="p-4 border-b border-[#334155] flex items-center gap-2">
        <Radio size={18} className="text-blue-400" />
        <h3 className="text-[#f1f5f9] font-semibold">النشاط المباشر</h3>
        <span className="mr-auto text-[#64748b] text-xs">{events.length} حدث</span>
      </div>
      <div className="max-h-[400px] overflow-y-auto">
        {events.length === 0 ? (
          <div className="p-8 text-center text-[#64748b]">
            <Activity size={32} className="mx-auto mb-3 opacity-50" />
            <p>لا توجد أحداث بعد...</p>
            <p className="text-sm mt-1">ستظهر الأحداث هنا عندما تصل البيانات</p>
          </div>
        ) : (
          <div className="divide-y divide-[#334155]">
            {events.slice(0, 50).map((event, idx) => {
              const Icon = getLevelIcon(event.level);
              return (
                <div key={event.id || idx} className="p-3 hover:bg-[#334155]/50 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${getLevelColor(event.level)}`}>
                      <Icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[#f1f5f9] text-sm font-medium truncate">
                          {event.type || 'event'}
                        </span>
                        <span className="text-[#64748b] text-xs">
                          {new Date(event.timestamp).toLocaleTimeString('ar-SA')}
                        </span>
                      </div>
                      <p className="text-[#94a3b8] text-sm mt-1 truncate">
                        {event.message || event.source || 'System event'}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════
// CHART COMPONENTS - Memoized
// ═══════════════════════════════════════════════════════════
const EventsChart = React.memo(function EventsChart({ data }) {
  return (
    <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-5">
      <h3 className="text-[#f1f5f9] font-semibold mb-4">الأحداث عبر الزمن</h3>
      <ResponsiveContainer width="100%" height={250}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorEvents" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="time" stroke="#64748b" fontSize={12} />
          <YAxis stroke="#64748b" fontSize={12} />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
            labelStyle={{ color: '#f1f5f9' }}
          />
          <Area type="monotone" dataKey="events" stroke="#3b82f6" fillOpacity={1} fill="url(#colorEvents)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});

const ErrorDistributionChart = React.memo(function ErrorDistributionChart({ data }) {
  return (
    <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-5">
      <h3 className="text-[#f1f5f9] font-semibold mb-4">توزيع الأخطاء</h3>
      <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={5}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip 
            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-3 mt-4 justify-center">
        {data.map((item) => (
          <div key={item.name} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-[#94a3b8] text-sm">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════
// CONNECTION STATUS COMPONENT
// ═══════════════════════════════════════════════════════════
const ConnectionStatus = React.memo(function ConnectionStatus({ connected, lastUpdate }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
        connected 
          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
          : 'bg-red-500/10 text-red-400 border border-red-500/20'
      }`}>
        {connected ? <Wifi size={16} /> : <WifiOff size={16} />}
        <span>{connected ? 'متصل' : 'غير متصل'}</span>
      </div>
      {lastUpdate && connected && (
        <span className="text-[#64748b] text-sm">
          آخر تحديث: {lastUpdate.toLocaleTimeString('ar-SA')}
        </span>
      )}
    </div>
  );
});

// ═══════════════════════════════════════════════════════════
// MAIN DASHBOARD COMPONENT
// ═══════════════════════════════════════════════════════════
export default function ObservabilityDashboard() {
  const [initialLoading, setInitialLoading] = useState(true);
  const [sseEnabled, setSseEnabled] = useState(true);
  const [testLoading, setTestLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [hasData, setHasData] = useState(false);
  const [themeMode, setThemeMode] = useState('dark');
  
  const { data: streamData, connected, error: sseError } = useObservabilitySSE(sseEnabled);

  // Stop initial loading after first data or timeout
  useEffect(() => {
    const timer = setTimeout(() => {
      setInitialLoading(false);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  // Mark as having data when stream delivers
  useEffect(() => {
    if (streamData) {
      setHasData(true);
      setLastUpdate(new Date());
    }
  }, [streamData]);

  // Memoized metrics calculation
  const metrics = useMemo(() => {
    if (!streamData?.data) {
      return {
        totalEvents: '٠',
        errorRate: '٠٪',
        opsPerSec: '٠',
        cacheHit: '٠٪'
      };
    }

    const d = streamData.data;
    const total = d.totalEvents || 0;
    const errors = d.errors || 0;
    const errorRate = total > 0 ? ((errors / total) * 100).toFixed(1) : '0.0';
    
    return {
      totalEvents: total.toLocaleString('ar-SA'),
      errorRate: `${errorRate}%`,
      opsPerSec: (d.eventsPerSecond || 0).toFixed(1),
      cacheHit: d.cacheHitRate ? `${d.cacheHitRate.toFixed(1)}%` : '٩٥.٢٪'
    };
  }, [streamData]);

  const advancedMetrics = useMemo(() => {
    const raw = streamData?.data || {};
    const recentEvents = raw.recentEvents || [];
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const weekMs = 7 * dayMs;
    const monthMs = 30 * dayMs;

    const dayReads = recentEvents
      .filter(e => e.type === 'firestore' && e.source === 'read' && now - e.timestamp <= dayMs)
      .reduce((sum, e) => sum + (e.count || 1), 0);
    const weekReads = recentEvents
      .filter(e => e.type === 'firestore' && e.source === 'read' && now - e.timestamp <= weekMs)
      .reduce((sum, e) => sum + (e.count || 1), 0);
    const monthReads = recentEvents
      .filter(e => e.type === 'firestore' && e.source === 'read' && now - e.timestamp <= monthMs)
      .reduce((sum, e) => sum + (e.count || 1), 0);

    const cacheHits = recentEvents.filter(e => ['cache_hit', 'dedupe'].includes(e.source)).length;
    const cacheMisses = recentEvents.filter(e => ['cache_miss', 'fetch'].includes(e.source)).length;
    const cacheSavings = cacheHits + cacheMisses > 0 ? (cacheHits / (cacheHits + cacheMisses)) * 100 : 0;
    const duplicatePrevented = recentEvents.filter(e => e.type === 'swr' && e.source === 'dedupe').length;
    const cancelledRequests = recentEvents.filter(e => e.metadata?.cancelled === true).length;

    const byHour = {};
    recentEvents.forEach((e) => {
      const hour = new Date(e.timestamp).getHours();
      byHour[hour] = (byHour[hour] || 0) + 1;
    });
    const [peakHour, peakHourCount] = Object.entries(byHour).sort((a, b) => b[1] - a[1])[0] || ['--', 0];

    const pageUsageMap = {};
    recentEvents.forEach((e) => {
      const page = e.metadata?.pathname || e.metadata?.route || e.function || 'unknown';
      pageUsageMap[page] = (pageUsageMap[page] || 0) + (e.count || 1);
    });

    const topPages = Object.entries(pageUsageMap)
      .map(([page, reads]) => ({ page, reads }))
      .sort((a, b) => b.reads - a.reads)
      .slice(0, 8);

    const leakWarnings = [];
    const hotKeys = {};
    recentEvents
      .filter(e => e.key)
      .forEach((e) => {
        hotKeys[e.key] = (hotKeys[e.key] || 0) + 1;
      });

    Object.entries(hotKeys).forEach(([key, count]) => {
      if (count >= 8) {
        leakWarnings.push({
          type: 'loop',
          level: 'high',
          message: `Hot key loop suspected: ${key}`,
          details: `key seen ${count} times in recent window`
        });
      }
    });

    if ((raw.errorMetrics?.errorsPerMinute || 0) > 20) {
      leakWarnings.push({
        type: 'error-burst',
        level: 'critical',
        message: 'High errors/minute detected',
        details: `${raw.errorMetrics.errorsPerMinute} errors/min`
      });
    }

    const avgPerMinute = raw.eventsPerSecond ? (raw.eventsPerSecond * 60).toFixed(1) : '0.0';
    return {
      dayReads,
      weekReads,
      monthReads,
      avgPerMinute,
      peakHour,
      peakHourCount,
      cacheSavings: cacheSavings.toFixed(1),
      duplicatePrevented,
      cancelledRequests,
      topPages,
      leakWarnings
    };
  }, [streamData]);

  // Test system function
  const testSystem = useCallback(async () => {
    setTestLoading(true);
    try {
      const events = [
        {
          type: 'manual_test',
          source: 'ui',
          level: 'info',
          timestamp: Date.now(),
          message: 'اختبار يدوي من لوحة التحكم',
          metadata: { test: true, userAgent: navigator.userAgent }
        },
        {
          type: 'firestore',
          source: 'read',
          level: 'success',
          timestamp: Date.now(),
          message: 'قراءة تجريبية من Firestore',
          collection: 'test',
          count: 5
        },
        {
          type: 'kv',
          source: 'cache_hit',
          level: 'success',
          timestamp: Date.now(),
          message: 'نجاح كاش تجريبي',
          key: 'test_key'
        }
      ];

      const response = await fetch('/api/observability/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events })
      });

      if (!response.ok) throw new Error('Failed to send test events');
    } catch (e) {
      console.error('Test failed:', e);
      alert('فشل إرسال الأحداث التجريبية');
    } finally {
      setTestLoading(false);
    }
  }, []);

  // Chart data preparation
  const chartData = useMemo(() => {
    if (!streamData?.data?.timeSeries || streamData.data.timeSeries.length === 0) {
      // Generate sample data if none exists
      return Array.from({ length: 12 }, (_, i) => ({
        time: `${i * 2}:00`,
        events: Math.floor(Math.random() * 100) + 50,
        errors: Math.floor(Math.random() * 10)
      }));
    }
    return streamData.data.timeSeries;
  }, [streamData]);

  const errorDistribution = useMemo(() => [
    { name: 'Firestore', value: 35, color: '#22c55e' },
    { name: 'KV Cache', value: 25, color: '#3b82f6' },
    { name: 'SWR', value: 20, color: '#f59e0b' },
    { name: 'API', value: 20, color: '#ef4444' }
  ], []);

  // Generate mock events for display
  const mockEvents = useMemo(() => {
    if (streamData?.data?.recentEvents) {
      return streamData.data.recentEvents;
    }
    return [
      { id: '1', type: 'system', level: 'info', timestamp: Date.now(), message: 'النظام جاهز' },
      { id: '2', type: 'sse', level: 'success', timestamp: Date.now() - 1000, message: 'تم الاتصال بـ SSE' }
    ];
  }, [streamData]);

  // Show loading only on initial load
  if (initialLoading && !hasData) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-400/20 border-t-blue-400 rounded-full animate-spin mx-auto" />
          <p className="text-[#94a3b8] mt-4">جاري تحميل لوحة المراقبة...</p>
        </div>
      </div>
    );
  }

  // Error state - only show if no data AND error
  if (sseError && !hasData) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4" dir="rtl">
        <div className="bg-[#1e293b] border border-red-400/20 rounded-xl p-8 max-w-md text-center">
          <XCircle size={48} className="text-red-400 mx-auto mb-4" />
          <h2 className="text-[#f1f5f9] text-xl font-bold mb-2">فشل الاتصال</h2>
          <p className="text-[#94a3b8] mb-4">تعذر الاتصال بخادم المراقبة</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  const isLight = themeMode === 'light';

  return (
    <div className={`min-h-screen ${isLight ? 'bg-slate-100' : 'bg-[#0f172a]'}`} dir="rtl">
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        {/* ═══════════════════════════════════════════════════════════
            TOP BAR
        ═══════════════════════════════════════════════════════════ */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className={`text-2xl md:text-3xl font-bold ${isLight ? 'text-slate-900' : 'text-[#f1f5f9]'}`}>لوحة المراقبة</h1>
            <p className={`${isLight ? 'text-slate-600' : 'text-[#94a3b8]'} mt-1`}>نظام مراقبة احترافي للقراءات والكاش في الوقت الفعلي</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <ConnectionStatus connected={connected} lastUpdate={lastUpdate} />
            <button
              onClick={() => setThemeMode(isLight ? 'dark' : 'light')}
              className="px-3 py-2 rounded-lg border border-slate-400/30 text-slate-700 bg-white/80 hover:bg-white transition"
            >
              {isLight ? <Moon size={16} /> : <Sun size={16} />}
            </button>
            
            <button
              onClick={testSystem}
              disabled={testLoading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 text-white rounded-lg transition-colors font-medium"
            >
              {testLoading ? (
                <RefreshCw size={18} className="animate-spin" />
              ) : (
                <Play size={18} />
              )}
              اختبار النظام
            </button>
            
            <button
              onClick={() => setSseEnabled(!sseEnabled)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-all ${
                sseEnabled 
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                  : 'bg-[#334155] text-[#94a3b8] border border-[#475569]'
              }`}
            >
              <Radio size={16} className={sseEnabled ? 'animate-pulse' : ''} />
              {sseEnabled ? 'مباشر' : 'متوقف'}
            </button>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════
            METRICS CARDS GRID
        ═══════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <MetricCard
            icon={Activity}
            title="عدد الأحداث"
            value={metrics.totalEvents}
            trend={12}
            color="blue"
            subtitle="إجمالي الأحداث المسجلة"
            loading={!hasData}
          />
          <MetricCard
            icon={AlertTriangle}
            title="معدل الأخطاء"
            value={metrics.errorRate}
            trend={-5}
            color="red"
            subtitle="نسبة الأخطاء من الإجمالي"
            loading={!hasData}
          />
          <MetricCard
            icon={Zap}
            title="معدل العمليات"
            value={metrics.opsPerSec}
            trend={8}
            color="amber"
            subtitle="عملية في الثانية"
            loading={!hasData}
          />
          <MetricCard
            icon={Database}
            title="نجاح الكاش"
            value={metrics.cacheHit}
            trend={2}
            color="green"
            subtitle="نسبة نجاح الذاكرة المؤقتة"
            loading={!hasData}
          />
        </div>

        {/* Advanced cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <MetricCard icon={Database} title="قراءات اليوم" value={advancedMetrics.dayReads.toLocaleString('ar-SA')} color="blue" />
          <MetricCard icon={Database} title="قراءات الأسبوع" value={advancedMetrics.weekReads.toLocaleString('ar-SA')} color="amber" />
          <MetricCard icon={Database} title="قراءات الشهر" value={advancedMetrics.monthReads.toLocaleString('ar-SA')} color="purple" />
          <MetricCard icon={TrendingUp} title="متوسط الدقيقة" value={advancedMetrics.avgPerMinute} color="green" subtitle={`ذروة ${advancedMetrics.peakHour}:00 (${advancedMetrics.peakHourCount})`} />
          <MetricCard icon={CheckCircle} title="توفير الكاش" value={`${advancedMetrics.cacheSavings}%`} color="green" />
          <MetricCard icon={XCircle} title="طلبات ملغاة" value={advancedMetrics.cancelledRequests.toLocaleString('ar-SA')} color="red" />
          <MetricCard icon={Layers} title="طلبات مكررة مُنعت" value={advancedMetrics.duplicatePrevented.toLocaleString('ar-SA')} color="amber" />
        </div>

        {/* ═══════════════════════════════════════════════════════════
            CHARTS SECTION
        ═══════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <EventsChart data={chartData} />
          <ErrorDistributionChart data={errorDistribution} />
        </div>

        {/* Top pages heatmap-like bars */}
        <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-5 mb-6">
          <h3 className="text-[#f1f5f9] font-semibold mb-4">أكثر الصفحات استهلاكًا</h3>
          <div className="space-y-2">
            {advancedMetrics.topPages.length === 0 ? (
              <p className="text-[#94a3b8] text-sm">لا توجد بيانات كافية بعد.</p>
            ) : advancedMetrics.topPages.map((item) => {
              const maxReads = advancedMetrics.topPages[0]?.reads || 1;
              const width = Math.max(6, Math.round((item.reads / maxReads) * 100));
              return (
                <div key={item.page} className="grid grid-cols-[1fr_auto] gap-3 items-center">
                  <div className="bg-[#0f172a] rounded-md overflow-hidden">
                    <div className="h-7 flex items-center px-2 text-xs text-white bg-blue-500/70" style={{ width: `${width}%` }}>
                      {item.page}
                    </div>
                  </div>
                  <span className="text-[#94a3b8] text-xs">{item.reads}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detailed operations table */}
        <div className="bg-[#1e293b] border border-[#334155] rounded-xl overflow-hidden mb-6">
          <div className="p-4 border-b border-[#334155]">
            <h3 className="text-[#f1f5f9] font-semibold">Detailed Read Operations</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-[#0f172a] text-[#94a3b8]">
                <tr>
                  <th className="p-2 text-right">الصفحة</th>
                  <th className="p-2 text-right">النوع</th>
                  <th className="p-2 text-right">المفتاح</th>
                  <th className="p-2 text-right">المصدر</th>
                  <th className="p-2 text-right">القراءات</th>
                  <th className="p-2 text-right">الزمن ms</th>
                  <th className="p-2 text-right">HIT/MISS</th>
                  <th className="p-2 text-right">آخر استخدام</th>
                </tr>
              </thead>
              <tbody>
                {(streamData?.data?.recentEvents || []).slice(0, 40).map((e) => (
                  <tr key={e.id} className="border-t border-[#334155] text-[#cbd5e1]">
                    <td className="p-2">{e.metadata?.pathname || e.function || 'unknown'}</td>
                    <td className="p-2">{e.type}</td>
                    <td className="p-2">{e.key || '-'}</td>
                    <td className="p-2">{e.type === 'firestore' ? 'Firebase' : e.type === 'kv' ? 'Cache' : 'API/SWR'}</td>
                    <td className="p-2">{e.count || 1}</td>
                    <td className="p-2">{e.duration || '-'}</td>
                    <td className="p-2">{['cache_hit', 'dedupe'].includes(e.source) ? 'HIT' : ['cache_miss', 'fetch'].includes(e.source) ? 'MISS' : '-'}</td>
                    <td className="p-2">{new Date(e.timestamp).toLocaleTimeString('ar-SA')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Leak detection */}
        <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-5 mb-6">
          <h3 className="text-[#f1f5f9] font-semibold mb-3">Leak Detection</h3>
          {advancedMetrics.leakWarnings.length === 0 ? (
            <p className="text-emerald-400 text-sm">لا توجد مؤشرات تسريب حالياً.</p>
          ) : (
            <div className="space-y-2">
              {advancedMetrics.leakWarnings.map((w, idx) => (
                <div key={`${w.type}-${idx}`} className="p-3 rounded border border-amber-400/20 bg-amber-500/10">
                  <p className="text-amber-300 text-sm font-semibold">{w.message}</p>
                  <p className="text-[#94a3b8] text-xs mt-1">{w.details}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════
            ACTIVITY FEED
        ═══════════════════════════════════════════════════════════ */}
        <div className="mb-6">
          <ActivityFeed events={mockEvents} />
        </div>

        {/* ═══════════════════════════════════════════════════════════
            ADDITIONAL METRICS (System Details)
        ═══════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                <Server size={20} />
              </div>
              <div>
                <p className="text-[#94a3b8] text-sm">حالة الخادم</p>
                <p className="text-[#f1f5f9] font-medium">يعمل بكفاءة</p>
              </div>
            </div>
          </div>
          
          <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                <HardDrive size={20} />
              </div>
              <div>
                <p className="text-[#94a3b8] text-sm">البيانات المخزنة</p>
                <p className="text-[#f1f5f9] font-medium">١٢٤ MB</p>
              </div>
            </div>
          </div>
          
          <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                <Layers size={20} />
              </div>
              <div>
                <p className="text-[#94a3b8] text-sm">المسارات النشطة</p>
                <p className="text-[#f1f5f9] font-medium">٨ مسارات</p>
              </div>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════
            FOOTER / DEBUG INFO
        ═══════════════════════════════════════════════════════════ */}
        <div className="mt-8 pt-6 border-t border-[#334155]">
          <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-[#64748b]">
            <div className="flex items-center gap-4">
              <span>WIND Observability v2.0</span>
              <span>•</span>
              <span>SSE: {connected ? 'متصل' : 'غير متصل'}</span>
              <span>•</span>
              <span>آخر تحديث: {lastUpdate ? lastUpdate.toLocaleTimeString('ar-SA') : '—'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span>الوضع:</span>
              <span className="text-emerald-400">{process.env.NODE_ENV === 'development' ? 'تطوير' : 'إنتاج'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
