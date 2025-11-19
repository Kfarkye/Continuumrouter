/**
 * ConnectionIndicator
 *
 * Real-time connection status indicator with retry UI
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, WifiOff, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';

type ConnectionState = 'online' | 'offline' | 'slow' | 'reconnecting';

interface ConnectionIndicatorProps {
  error?: { code: string; message: string } | null;
  isStreaming?: boolean;
  onRetry?: () => void;
  className?: string;
}

/**
 * Hook to monitor network connectivity
 */
function useNetworkState() {
  const [state, setState] = useState<ConnectionState>('online');

  useEffect(() => {
    const updateOnlineStatus = () => {
      setState(navigator.onLine ? 'online' : 'offline');
    };

    // Initial check
    updateOnlineStatus();

    // Listen to events
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  return state;
}

/**
 * Hook to detect slow connections
 */
function useSlowConnectionDetection(isStreaming: boolean) {
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    if (!isStreaming) {
      setIsSlow(false);
      return;
    }

    // Detect if streaming takes too long
    const timer = setTimeout(() => {
      setIsSlow(true);
    }, 10000); // 10 seconds

    return () => clearTimeout(timer);
  }, [isStreaming]);

  return isSlow;
}

export const ConnectionIndicator: React.FC<ConnectionIndicatorProps> = ({
  error,
  isStreaming = false,
  onRetry,
  className,
}) => {
  const networkState = useNetworkState();
  const isSlowConnection = useSlowConnectionDetection(isStreaming);

  // Determine current state
  let state: ConnectionState = networkState;

  if (error?.code === 'STREAM_TIMEOUT' || isSlowConnection) {
    state = 'slow';
  }

  if (error?.code === 'STREAM_FETCH_FAILED' && networkState === 'offline') {
    state = 'offline';
  }

  // Don't show anything if everything is fine
  if (state === 'online' && !error && !isSlowConnection) {
    return null;
  }

  const stateConfig = {
    online: {
      icon: Wifi,
      text: 'Connected',
      color: 'text-green-400',
      bg: 'bg-green-500/10',
      border: 'border-green-500/30',
    },
    offline: {
      icon: WifiOff,
      text: 'No connection',
      color: 'text-red-400',
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
    },
    slow: {
      icon: AlertCircle,
      text: 'Slow connection',
      color: 'text-yellow-400',
      bg: 'bg-yellow-500/10',
      border: 'border-yellow-500/30',
    },
    reconnecting: {
      icon: RefreshCw,
      text: 'Reconnecting',
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/30',
    },
  };

  const config = stateConfig[state];
  const Icon = config.icon;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className={cn(
          'fixed top-4 left-1/2 -translate-x-1/2 z-50',
          className
        )}
      >
        <div
          className={cn(
            'flex items-center gap-3 px-4 py-2.5 rounded-full',
            'backdrop-blur-xl backdrop-saturate-150',
            'border shadow-lg',
            config.bg,
            config.border
          )}
        >
          <Icon
            className={cn('h-4 w-4', config.color, state === 'reconnecting' && 'animate-spin')}
          />
          <span className={cn('text-sm font-medium', config.color)}>
            {config.text}
          </span>

          {onRetry && (state === 'offline' || state === 'slow') && (
            <>
              <div className="w-px h-4 bg-white/10" />
              <button
                onClick={onRetry}
                className={cn(
                  'text-xs font-medium hover:underline transition-all',
                  config.color
                )}
              >
                Retry
              </button>
            </>
          )}
        </div>

        {/* Error details */}
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 px-4 py-2 bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-lg"
          >
            <p className="text-xs text-zinc-400">{error.message}</p>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

/**
 * Compact inline connection badge
 */
export const ConnectionBadge: React.FC<{
  state: ConnectionState;
  className?: string;
}> = ({ state, className }) => {
  const colors = {
    online: 'bg-green-500',
    offline: 'bg-red-500',
    slow: 'bg-yellow-500',
    reconnecting: 'bg-blue-500',
  };

  return (
    <div
      className={cn('flex items-center gap-2', className)}
      role="status"
      aria-label={`Connection: ${state}`}
    >
      <span
        className={cn(
          'w-2 h-2 rounded-full',
          colors[state],
          state === 'reconnecting' && 'animate-pulse'
        )}
      />
      <span className="text-xs text-zinc-400 capitalize">{state}</span>
    </div>
  );
};
