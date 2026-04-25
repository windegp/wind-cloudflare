"use client";

import { useMemo } from 'react';

/**
 * @param {Object} props
 * @param {Array} props.errors
 * @param {number} [props.hours=24]
 */
export default function ErrorHeatmap({ errors, hours = 24 }) {
  const heatmapData = useMemo(() => {
    const now = Date.now();
    const hourMs = 60 * 60 * 1000;
    const buckets = hours;
    
    // Initialize buckets
    const data = Array.from({ length: buckets }, (_, i) => ({
      hour: new Date(now - (buckets - 1 - i) * hourMs).getHours(),
      date: new Date(now - (buckets - 1 - i) * hourMs).toISOString().split('T')[0],
      count: 0,
      sources: {}
    }));

    // Distribute errors into buckets
    errors.forEach(error => {
      const errorTime = new Date(error.timestamp).getTime();
      const bucketIndex = Math.floor((now - errorTime) / hourMs);
      
      if (bucketIndex >= 0 && bucketIndex < buckets) {
        data[bucketIndex].count += error.count;
        data[bucketIndex].sources[error.source] = (data[bucketIndex].sources[error.source] || 0) + error.count;
      }
    });

    return data;
  }, [errors, hours]);

  const maxCount = Math.max(...heatmapData.map(d => d.count), 1);

  const getIntensity = (count) => {
    if (count === 0) return 'bg-gray-800';
    const ratio = count / maxCount;
    if (ratio < 0.2) return 'bg-red-900/30';
    if (ratio < 0.4) return 'bg-red-800/40';
    if (ratio < 0.6) return 'bg-red-700/50';
    if (ratio < 0.8) return 'bg-red-600/60';
    return 'bg-red-500/70';
  };

  const getHourLabel = (hour, date) => {
    const today = new Date().toISOString().split('T')[0];
    if (date === today) {
      return `${hour}:00`;
    }
    return `${date.slice(5)} ${hour}:00`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-gray-400">
        <span>Error distribution over last {hours} hours</span>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            <div className="w-3 h-3 bg-gray-800 rounded" />
            <span>0</span>
          </span>
          <span className="flex items-center gap-1">
            <div className="w-3 h-3 bg-red-900/30 rounded" />
            <span>Low</span>
          </span>
          <span className="flex items-center gap-1">
            <div className="w-3 h-3 bg-red-500/70 rounded" />
            <span>High</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-1">
        {heatmapData.map((bucket, index) => (
          <div
            key={index}
            className={`aspect-square rounded ${getIntensity(bucket.count)} cursor-pointer transition-all hover:scale-110`}
            title={`${getHourLabel(bucket.hour, bucket.date)}: ${bucket.count} errors`}
          >
            {bucket.count > 0 && (
              <div className="w-full h-full flex items-center justify-center text-xs font-bold text-white">
                {bucket.count}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Source breakdown */}
      <div className="mt-4 space-y-2">
        <h4 className="text-sm font-medium text-gray-400">Error Sources</h4>
        {Object.entries(
          heatmapData.reduce((acc, bucket) => {
            Object.entries(bucket.sources).forEach(([source, count]) => {
              acc[source] = (acc[source] || 0) + count;
            });
            return acc;
          }, {})
        )
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([source, count]) => (
            <div key={source} className="flex items-center justify-between text-sm">
              <span className="text-gray-400">{source}</span>
              <span className="text-white font-medium">{count}</span>
            </div>
          ))}
      </div>
    </div>
  );
}
