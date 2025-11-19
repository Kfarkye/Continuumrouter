import React from 'react';

interface ProgressIndicatorProps {
  progress: number;
  step: string;
  onCancel: () => void;
  estimatedTime?: string;
}

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  progress,
  step,
  onCancel,
  estimatedTime,
}) => {
  return (
    <div className="progress-indicator">
      <div className="progress-header">
        <span className="progress-step">{step}</span>
        <button onClick={onCancel} className="cancel-btn-small" title="Cancel">
          ⏸️ Cancel
        </button>
      </div>
      <div className="progress-bar-container">
        <div
          className="progress-bar-fill"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="progress-footer">
        <div className="progress-percentage">{progress.toFixed(0)}%</div>
        {estimatedTime && (
          <div className="progress-time">Est. {estimatedTime}</div>
        )}
      </div>
    </div>
  );
};
