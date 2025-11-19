import React from 'react';

export const SkeletonLoader: React.FC<{ count?: number }> = ({ count = 3 }) => (
  <div className="space-y-3">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="glass rounded-xl p-4 animate-pulse">
        <div className="flex justify-between items-start">
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-white/10 rounded w-1/2"></div>
            <div className="h-3 bg-white/10 rounded w-3/4"></div>
            <div className="h-5 bg-white/10 rounded-full w-20 mt-2"></div>
          </div>
          <div className="flex gap-2">
            <div className="h-8 w-8 bg-white/10 rounded-lg"></div>
            <div className="h-8 w-8 bg-white/10 rounded-lg"></div>
            <div className="h-8 w-8 bg-white/10 rounded-lg"></div>
          </div>
        </div>
      </div>
    ))}
  </div>
);
