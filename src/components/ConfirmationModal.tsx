import React from 'react';
import { Spinner } from './Spinner';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, CheckCircle, X } from 'lucide-react';

type ConfirmationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'destructive' | 'default';
  isConfirming?: boolean;
};

const variants = {
  destructive: {
    icon: <AlertTriangle className="h-6 w-6 text-yellow-400" />,
    confirmButtonClasses:
      'bg-red-600 hover:bg-red-500 focus-visible:ring-red-500',
  },
  default: {
    icon: <CheckCircle className="h-6 w-6 text-blue-400" />,
    confirmButtonClasses:
      'bg-blue-600 hover:bg-blue-500 focus-visible:ring-blue-500',
  },
};

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'destructive',
  isConfirming = false,
}) => {
  const selectedVariant = variants[variant];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirmation-modal-title"
          aria-describedby="confirmation-modal-message"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="relative w-full max-w-md rounded-2xl border border-white/10 bg-gray-900 p-6 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0">{selectedVariant.icon}</div>
              <div className="flex-1">
                <h3
                  id="confirmation-modal-title"
                  className="text-lg font-semibold text-white"
                >
                  {title}
                </h3>
                <p
                  id="confirmation-modal-message"
                  className="mt-2 text-sm text-white/70"
                >
                  {message}
                </p>
              </div>
              <button
                onClick={onClose}
                disabled={isConfirming}
                className="absolute top-3 right-3 rounded-full p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:opacity-50"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={onClose}
                disabled={isConfirming}
                className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cancelText}
              </button>
              <button
                onClick={onConfirm}
                disabled={isConfirming}
                className={`flex min-w-[100px] items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:cursor-not-allowed disabled:opacity-50 ${selectedVariant.confirmButtonClasses}`}
              >
                {isConfirming ? (
                  <Spinner size="md" color="white" />
                ) : (
                  confirmText
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
