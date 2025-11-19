import React from 'react';
import { Mail, Lightbulb } from 'lucide-react';

interface EmailTemplateHintsProps {
  clinicianName?: string;
  daysRemaining?: number;
  onClose?: () => void;
}

export const EmailTemplateHints: React.FC<EmailTemplateHintsProps> = ({
  clinicianName,
  daysRemaining,
  onClose,
}) => {
  const getRecommendation = () => {
    if (daysRemaining === undefined) {
      return {
        template: 'Outreach Email',
        prompt: `Draft an initial outreach email`,
        color: 'blue',
      };
    }

    if (daysRemaining <= 28) {
      return {
        template: 'URGENT Extension Request',
        prompt: `Draft an urgent extension email${clinicianName ? ` for ${clinicianName}` : ''}`,
        color: 'red',
      };
    }

    if (daysRemaining <= 42) {
      return {
        template: 'Extension Request',
        prompt: `Draft an extension email${clinicianName ? ` for ${clinicianName}` : ''}`,
        color: 'orange',
      };
    }

    if (daysRemaining <= 56) {
      return {
        template: 'Check-In Email',
        prompt: `Draft a check-in email${clinicianName ? ` for ${clinicianName}` : ''}`,
        color: 'yellow',
      };
    }

    return null;
  };

  const recommendation = getRecommendation();

  if (!recommendation) return null;

  const colorClasses = {
    blue: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
    red: 'bg-red-500/10 border-red-500/20 text-red-400',
    orange: 'bg-orange-500/10 border-orange-500/20 text-orange-400',
    yellow: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400',
  };

  return (
    <div className={`rounded-lg border p-4 mb-4 ${colorClasses[recommendation.color as keyof typeof colorClasses]}`}>
      <div className="flex items-start gap-3">
        <Lightbulb className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Mail className="w-4 h-4" />
            <span className="font-semibold text-sm">Suggested: {recommendation.template}</span>
          </div>
          <p className="text-sm opacity-90 mb-3">
            Try asking: "{recommendation.prompt}"
          </p>
          <div className="text-xs opacity-70">
            Other examples:
            <ul className="mt-1 ml-4 list-disc">
              <li>Draft an email about extension options</li>
              <li>Create a professional outreach email</li>
              <li>Help me write a follow-up message</li>
            </ul>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white/60 transition-colors"
            aria-label="Close hint"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
};
