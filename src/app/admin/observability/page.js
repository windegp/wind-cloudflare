"use client";

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
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
  BarChart3,
  PieChart,
  LineChart as LineChartIcon,
  DollarSign,
  GitBranch,
  Flame,
  Radio
} from '@/components/icons-extra';
import { getObservabilityData, getMockObservabilityData, DEBUG_MODE } from '@/lib/observability-new';
import { useObservabilityStream } from '@/hooks/useObservabilityStream.js';
import { migrateLegacyLogs } from '@/lib/observabilityEmitter';

// Lazy load chart components for performance
const LineChart = dynamic(() => import('@/components/observability/LineChart'), { 
  loading: () => <div className="h-64 animate-pulse bg-gray-800 rounded-lg" />,
  ssr: false 
});
const BarChart = dynamic(() => import('@/components/observability/BarChart'), { 
  loading: () => <div className="h-64 animate-pulse bg-gray-800 rounded-lg" />,
  ssr: false 
});
const PieChartComponent = dynamic(() => import('@/components/observability/PieChart'), { 
  loading: () => <div className="h-64 animate-pulse bg-gray-800 rounded-lg" />,
  ssr: false 
});
const ErrorHeatmap = dynamic(() => import('@/components/observability/ErrorHeatmap'), { 
  loading: () => <div className="h-64 animate-pulse bg-gray-800 rounded-lg" />,
  ssr: false 
});

export default function ObservabilityDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [debugMode, setDebugMode] = useState(DEBUG_MODE);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [realtimeEnabled, setRealtimeEnabled] = useState(false);
  
  // Real-time stream hook
  const streamData = useObservabilityStream(realtimeEnabled);

  // Migrate legacy logs on mount (client-side only)
  useEffect(() => {
    migrateLegacyLogs();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // In production, this would fetch from an API endpoint
      // For now, we use mock data or client-side aggregation
      const useMock = process.env.NODE_ENV === 'development' && !debugMode;
      const observabilityData = useMock ? getMockObservabilityData() : getObservabilityData();
      setData(observabilityData);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to fetch observability data:', error);
      // Fallback to mock data on error
      setData(getMockObservabilityData());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    
    if (autoRefresh) {
      const interval = setInterval(fetchData, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh, debugMode]);

  const getQuotaStatusColor = (status) => {
    switch (status) {
      case 'healthy': return 'text-green-400';
      case 'warning': return 'text-yellow-400';
      case 'critical': return 'text-orange-400';
      case 'emergency': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getQuotaStatusBg = (status) => {
    switch (status) {
      case 'healthy': return 'bg-green-400/10 border-green-400/20';
      case 'warning': return 'bg-yellow-400/10 border-yellow-400/20';
      case 'critical': return 'bg-orange-400/10 border-orange-400/20';
      case 'emergency': return 'bg-red-400/10 border-red-400/20';
      default: return 'bg-gray-400/10 border-gray-400/20';
    }
  };

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-white/20"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Observability Dashboard</h1>
          <p className="text-gray-400">Real-time system metrics and performance monitoring</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdate && (
            <div className="text-sm text-gray-500 flex items-center gap-2">
              <Clock size={16} />
              Last updated: {lastUpdate.toLocaleTimeString()}
            </div>
          )}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              autoRefresh 
                ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                : 'bg-gray-800 text-gray-400 border border-gray-700'
            }`}
          >
            <RefreshCw size={16} className={autoRefresh ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setRealtimeEnabled(!realtimeEnabled)}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              realtimeEnabled 
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' 
                : 'bg-gray-800 text-gray-400 border border-gray-700'
            }`}
          >
            <Radio size={16} className={realtimeEnabled ? 'animate-pulse' : ''} />
          </button>
          <button
            onClick={() => setDebugMode(!debugMode)}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              debugMode 
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' 
                : 'bg-gray-800 text-gray-400 border border-gray-700'
            }`}
          >
            Debug Mode
          </button>
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-white/10 text-white rounded-lg font-medium hover:bg-white/20 transition-all border border-white/20"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Firestore Reads"
          value={data?.firestore?.readsToday || 0}
          change="+12%"
          icon={<Database size={24} />}
          color="blue"
        />
        <MetricCard
          title="Cache Hit Rate"
          value={`${data?.kvCache?.hitRate?.toFixed(1) || 0}%`}
          change="+5%"
          icon={<Zap size={24} />}
          color="green"
        />
        <MetricCard
          title="SWR Dedupes"
          value={data?.swr?.dedupedRequests || 0}
          change="+8%"
          icon={<Activity size={24} />}
          color="purple"
        />
        <MetricCard
          title="Invalidations"
          value={data?.revalidation?.totalInvalidations || 0}
          change="-3%"
          icon={<RefreshCw size={24} />}
          color="orange"
        />
      </div>

      {/* Firestore Metrics */}
      <GlassCard>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Database size={20} className="text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Firestore Metrics</h2>
              <p className="text-sm text-gray-400">Read/write operations and quota status</p>
            </div>
          </div>
          <div className={`px-4 py-2 rounded-lg border ${getQuotaStatusBg(data?.firestore?.quotaStatus?.status)}`}>
            <span className={`text-sm font-medium ${getQuotaStatusColor(data?.firestore?.quotaStatus?.status)}`}>
              {data?.firestore?.quotaStatus?.status?.toUpperCase() || 'UNKNOWN'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-4">Read Trends</h3>
            <LineChart
              data={[
                { name: 'Today', reads: data?.firestore?.readsToday || 0 },
                { name: 'Week', reads: data?.firestore?.readsWeek || 0 },
                { name: 'Month', reads: data?.firestore?.readsMonth || 0 }
              ]}
              dataKey="reads"
              color="#3b82f6"
            />
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-4">Top Collections</h3>
            <BarChart
              data={data?.firestore?.topCollections?.slice(0, 5) || []}
              dataKey="count"
              nameKey="name"
              color="#3b82f6"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-6">
          <StatBox
            label="Reads/Min"
            value={data?.firestore?.quotaStatus?.readsThisMinute || 0}
            icon={<TrendingUp size={16} />}
          />
          <StatBox
            label="Reads/Sec"
            value={data?.firestore?.quotaStatus?.readsPerSecond || '0'}
            icon={<Clock size={16} />}
          />
          <StatBox
            label="Projected/Hour"
            value={data?.firestore?.quotaStatus?.projectedHourly || '0'}
            icon={<AlertTriangle size={16} />}
          />
        </div>
      </GlassCard>

      {/* KV Cache Metrics */}
      <GlassCard>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-green-500/20 rounded-lg">
            <Zap size={20} className="text-green-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">KV Cache Metrics</h2>
            <p className="text-sm text-gray-400">Cache performance and key access patterns</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-4">Cache Performance</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                <div className="text-2xl font-bold text-green-400">{data?.kvCache?.cacheHits || 0}</div>
                <div className="text-sm text-gray-400">Cache Hits</div>
              </div>
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                <div className="text-2xl font-bold text-red-400">{data?.kvCache?.cacheMisses || 0}</div>
                <div className="text-sm text-gray-400">Cache Misses</div>
              </div>
            </div>
            <PieChartComponent
              data={[
                { name: 'Hits', value: data?.kvCache?.cacheHits || 0, color: '#22c55e' },
                { name: 'Misses', value: data?.kvCache?.cacheMisses || 0, color: '#ef4444' }
              ]}
            />
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-4">Most Accessed Keys</h3>
            <BarChart
              data={data?.kvCache?.mostAccessedKeys?.slice(0, 5) || []}
              dataKey="count"
              nameKey="key"
              color="#22c55e"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-6">
          <StatBox
            label="Background Refreshes"
            value={data?.kvCache?.backgroundRefreshes || 0}
            icon={<RefreshCw size={16} />}
          />
          <StatBox
            label="Stampede Prevented"
            value={data?.kvCache?.stampedePrevented || 0}
            icon={<CheckCircle size={16} />}
          />
        </div>
      </GlassCard>

      {/* SWR Metrics */}
      <GlassCard>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-purple-500/20 rounded-lg">
            <Activity size={20} className="text-purple-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">SWR Metrics</h2>
            <p className="text-sm text-gray-400">Data fetching and deduplication statistics</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-4">Fetch Operations</h3>
            <LineChart
              data={[
                { name: 'Total', value: data?.swr?.totalFetches || 0 },
                { name: 'Deduped', value: data?.swr?.dedupedRequests || 0 },
                { name: 'In-Flight', value: data?.swr?.inFlightRequests || 0 }
              ]}
              dataKey="value"
              color="#a855f7"
            />
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-4">Cache Distribution</h3>
            <PieChartComponent
              data={[
                { name: 'Hits', value: data?.swr?.cacheHits || 0, color: '#a855f7' },
                { name: 'Misses', value: data?.swr?.cacheMisses || 0, color: '#6b7280' }
              ]}
            />
          </div>
        </div>

        <div className="mt-6">
          <StatBox
            label="Average Response Time"
            value={`${data?.swr?.averageResponseTime?.toFixed(2) || 0}ms`}
            icon={<Clock size={16} />}
          />
        </div>
      </GlassCard>

      {/* Revalidation System */}
      <GlassCard>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-orange-500/20 rounded-lg">
            <RefreshCw size={20} className="text-orange-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Revalidation System</h2>
            <p className="text-sm text-gray-400">Cache invalidation patterns and cooldown stats</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-4">Invalidations by Type</h3>
            <BarChart
              data={[
                { name: 'Product', count: data?.revalidation?.byType?.product || 0 },
                { name: 'Review', count: data?.revalidation?.byType?.review || 0 },
                { name: 'Homepage', count: data?.revalidation?.byType?.homepage || 0 },
                { name: 'Collection', count: data?.revalidation?.byType?.collection || 0 },
                { name: 'Settings', count: data?.revalidation?.byType?.settings || 0 },
                { name: 'Other', count: data?.revalidation?.byType?.other || 0 }
              ]}
              dataKey="count"
              nameKey="name"
              color="#f97316"
            />
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-4">Invalidation Distribution</h3>
            <PieChartComponent
              data={[
                { name: 'Product', value: data?.revalidation?.byType?.product || 0, color: '#f97316' },
                { name: 'Review', value: data?.revalidation?.byType?.review || 0, color: '#eab308' },
                { name: 'Homepage', value: data?.revalidation?.byType?.homepage || 0, color: '#22c55e' },
                { name: 'Collection', value: data?.revalidation?.byType?.collection || 0, color: '#3b82f6' },
                { name: 'Settings', value: data?.revalidation?.byType?.settings || 0, color: '#a855f7' }
              ]}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-6">
          <StatBox
            label="Skipped (Cooldown)"
            value={data?.revalidation?.skippedDueToCooldown || 0}
            icon={<XCircle size={16} />}
          />
          <StatBox
            label="Avg Response Time"
            value={`${data?.revalidation?.averageResponseTime?.toFixed(2) || 0}ms`}
            icon={<Clock size={16} />}
          />
        </div>
      </GlassCard>

      {/* Live Activity Feed */}
      <GlassCard>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-pink-500/20 rounded-lg">
            <Activity size={20} className="text-pink-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Live Activity Feed</h2>
            <p className="text-sm text-gray-400">Real-time system events and operations</p>
          </div>
        </div>

        <ActivityFeed logs={data?.activityLogs || []} />
      </GlassCard>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* V2 SECTIONS */}
      {/* ═══════════════════════════════════════════════════════════ */}

      {/* Cost Calculator */}
      <GlassCard>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-yellow-500/20 rounded-lg">
            <DollarSign size={20} className="text-yellow-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Cost Calculator</h2>
            <p className="text-sm text-gray-400">Firestore and KV operation costs</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <div className="text-sm text-gray-400 mb-2">Total Cost (Session)</div>
            <div className="text-2xl font-bold text-white">${(data?.cost?.totalCost || 0).toFixed(4)}</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <div className="text-sm text-gray-400 mb-2">Projected Daily</div>
            <div className="text-2xl font-bold text-white">${(data?.cost?.projectedDailyCost || 0).toFixed(2)}</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <div className="text-sm text-gray-400 mb-2">Projected Monthly</div>
            <div className="text-2xl font-bold text-white">${(data?.cost?.projectedMonthlyCost || 0).toFixed(2)}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-3">Firestore Cost</h3>
            <div className="text-3xl font-bold text-blue-400 mb-1">${(data?.cost?.firestoreCost || 0).toFixed(4)}</div>
            <div className="text-xs text-gray-500">
              Reads: ${(data?.cost?.costByOperation?.firestore_read || 0).toFixed(4)} | 
              Writes: ${(data?.cost?.costByOperation?.firestore_write || 0).toFixed(4)}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-3">KV Cost</h3>
            <div className="text-3xl font-bold text-green-400 mb-1">${(data?.cost?.kvCost || 0).toFixed(4)}</div>
            <div className="text-xs text-gray-500">
              Reads: ${(data?.cost?.costByOperation?.kv_read || 0).toFixed(4)} | 
              Writes: ${(data?.cost?.costByOperation?.kv_write || 0).toFixed(4)}
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Request Tracing */}
      <GlassCard>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-cyan-500/20 rounded-lg">
            <GitBranch size={20} className="text-cyan-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Request Tracing</h2>
            <p className="text-sm text-gray-400">Distributed tracing with unique trace IDs</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <StatBox
            label="Total Traces"
            value={data?.traces?.totalTraces || 0}
            icon={<GitBranch size={16} />}
          />
          <StatBox
            label="Active Traces"
            value={data?.traces?.activeTraces || 0}
            icon={<Activity size={16} />}
          />
          <StatBox
            label="Avg Duration"
            value={`${(data?.traces?.averageTraceDuration || 0).toFixed(0)}ms`}
            icon={<Clock size={16} />}
          />
        </div>

        <div>
          <h3 className="text-sm font-medium text-gray-400 mb-3">Slowest Traces</h3>
          <div className="space-y-2">
            {(data?.traces?.slowestTraces || []).slice(0, 5).map((trace, i) => (
              <div key={i} className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <div className="text-xs text-gray-500 font-mono">{trace.traceId}</div>
                  <div className="text-sm text-white">{trace.operation}</div>
                </div>
                <div className="text-sm font-medium text-orange-400">{trace.duration}ms</div>
              </div>
            ))}
          </div>
        </div>
      </GlassCard>

      {/* Anomaly Detection */}
      <GlassCard>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-red-500/20 rounded-lg">
            <Flame size={20} className="text-red-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Anomaly Detection</h2>
            <p className="text-sm text-gray-400">Real-time anomaly detection and alerts</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
            <div className="text-2xl font-bold text-red-400">{data?.anomalies?.critical || 0}</div>
            <div className="text-sm text-gray-400">Critical</div>
          </div>
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4">
            <div className="text-2xl font-bold text-orange-400">{data?.anomalies?.high || 0}</div>
            <div className="text-sm text-gray-400">High</div>
          </div>
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
            <div className="text-2xl font-bold text-yellow-400">{data?.anomalies?.medium || 0}</div>
            <div className="text-sm text-gray-400">Medium</div>
          </div>
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
            <div className="text-2xl font-bold text-blue-400">{data?.anomalies?.low || 0}</div>
            <div className="text-sm text-gray-400">Low</div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium text-gray-400 mb-3">Recent Anomalies</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {(data?.anomalies?.recentAnomalies || []).map((anomaly, i) => (
              <div key={i} className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <div className={`px-2 py-1 rounded text-xs font-medium ${
                    anomaly.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                    anomaly.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                    anomaly.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-blue-500/20 text-blue-400'
                  }`}>
                    {anomaly.severity.toUpperCase()}
                  </div>
                  <div className="text-sm text-white">{anomaly.metric}</div>
                </div>
                <div className="text-xs text-gray-500">{new Date(anomaly.timestamp).toLocaleTimeString()}</div>
              </div>
            ))}
          </div>
        </div>
      </GlassCard>

      {/* Performance Regression Tracking */}
      <GlassCard>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-purple-500/20 rounded-lg">
            <TrendingUp size={20} className="text-purple-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Performance Tracking</h2>
            <p className="text-sm text-gray-400">Latency percentiles and regression detection</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <StatBox
            label="Baseline Ops"
            value={data?.performance?.baselineOperations || 0}
            icon={<GitBranch size={16} />}
          />
          <StatBox
            label="Regressions"
            value={data?.performance?.regressionsDetected || 0}
            icon={<AlertTriangle size={16} />}
          />
          <StatBox
            label="Avg Latency"
            value={`${(data?.performance?.averageLatency || 0).toFixed(0)}ms`}
            icon={<Clock size={16} />}
          />
          <StatBox
            label="P99 Latency"
            value={`${(data?.performance?.p99Latency || 0).toFixed(0)}ms`}
            icon={<TrendingUp size={16} />}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <div className="text-sm text-gray-400 mb-2">P50 Latency</div>
            <div className="text-2xl font-bold text-green-400">{(data?.performance?.averageLatency || 0).toFixed(0)}ms</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <div className="text-sm text-gray-400 mb-2">P95 Latency</div>
            <div className="text-2xl font-bold text-yellow-400">{(data?.performance?.p95Latency || 0).toFixed(0)}ms</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <div className="text-sm text-gray-400 mb-2">P99 Latency</div>
            <div className="text-2xl font-bold text-red-400">{(data?.performance?.p99Latency || 0).toFixed(0)}ms</div>
          </div>
        </div>
      </GlassCard>

      {/* Error Heatmap */}
      <GlassCard>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-red-500/20 rounded-lg">
            <XCircle size={20} className="text-red-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Error Heatmap</h2>
            <p className="text-sm text-gray-400">Error distribution over time</p>
          </div>
        </div>

        <ErrorHeatmap 
          errors={data?.activityLogs
            .filter((log) => log.type === 'error' || log.source === 'error')
            .map((log) => ({
              timestamp: log.timestamp,
              source: log.source,
              type: log.type,
              count: 1
            })) || []
          } 
          hours={24}
        />
      </GlassCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════

function MetricCard({ title, value, change, icon, color }) {
  const colorClasses = {
    blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    green: 'bg-green-500/20 text-green-400 border-green-500/30',
    purple: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    orange: 'bg-orange-500/20 text-orange-400 border-orange-500/30'
  };

  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-xl ${colorClasses[color] || colorClasses.blue}`}>
          {icon}
        </div>
        <span className={`text-sm font-medium ${change.startsWith('+') ? 'text-green-400' : 'text-red-400'}`}>
          {change}
        </span>
      </div>
      <div className="text-3xl font-bold text-white mb-1">{value}</div>
      <div className="text-sm text-gray-400">{title}</div>
    </div>
  );
}

function GlassCard({ children }) {
  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all">
      {children}
    </div>
  );
}

function StatBox({ label, value, icon }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-4">
      <div className="flex items-center gap-2 text-gray-400 mb-2">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <div className="text-xl font-bold text-white">{value}</div>
    </div>
  );
}

function ActivityFeed({ logs }) {
  const getEventIcon = (type) => {
    switch (type) {
      case 'read': return <Database size={16} className="text-blue-400" />;
      case 'write': return <Database size={16} className="text-orange-400" />;
      case 'cache_hit': return <Zap size={16} className="text-green-400" />;
      case 'cache_miss': return <XCircle size={16} className="text-red-400" />;
      case 'invalidation': return <RefreshCw size={16} className="text-orange-400" />;
      case 'swr_fetch': return <Activity size={16} className="text-purple-400" />;
      default: return <Activity size={16} className="text-gray-400" />;
    }
  };

  const getEventColor = (type) => {
    switch (type) {
      case 'read': return 'border-blue-500/30 bg-blue-500/10';
      case 'write': return 'border-orange-500/30 bg-orange-500/10';
      case 'cache_hit': return 'border-green-500/30 bg-green-500/10';
      case 'cache_miss': return 'border-red-500/30 bg-red-500/10';
      case 'invalidation': return 'border-orange-500/30 bg-orange-500/10';
      case 'swr_fetch': return 'border-purple-500/30 bg-purple-500/10';
      default: return 'border-gray-500/30 bg-gray-500/10';
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  if (logs.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <Activity size={48} className="mx-auto mb-4 opacity-50" />
        <p>No activity logs available</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
      {logs.map((log) => (
        <div
          key={log.id}
          className={`flex items-center gap-4 p-3 rounded-lg border ${getEventColor(log.type)}`}
        >
          <div className="p-2 bg-black/20 rounded-lg">
            {getEventIcon(log.type)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-white font-medium truncate">{log.details}</div>
            <div className="text-xs text-gray-400 flex items-center gap-2">
              <span>{log.source}</span>
              <span>•</span>
              <span>{formatTime(log.timestamp)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
