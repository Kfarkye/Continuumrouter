import { useState, useEffect, useCallback } from 'react';
import { TemplateContextService } from '../services/email/templateContextService';
import { UnifiedEmailData } from '../types/templates/emailTypes';

export function useTemplateContext(spaceId: string | null) {
  const [templateContext, setTemplateContext] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const loadTemplateContext = useCallback(async () => {
    if (!spaceId) {
      setTemplateContext('');
      return;
    }

    setIsLoading(true);
    try {
      const clinicianContext = await TemplateContextService.getClinicianContext(spaceId);
      const templateList = TemplateContextService.getTemplateListForAI();

      let context = templateList;

      if (clinicianContext) {
        context = `${clinicianContext}\n\n---\n\n${context}`;
      }

      setTemplateContext(context);
    } catch (error) {
      console.error('Failed to load template context:', error);
      setTemplateContext('');
    } finally {
      setIsLoading(false);
    }
  }, [spaceId]);

  useEffect(() => {
    loadTemplateContext();
  }, [loadTemplateContext]);

  const generateEmail = useCallback(
    (templateId: string, emailData: UnifiedEmailData): string => {
      return TemplateContextService.formatTemplateForChat(templateId, emailData);
    },
    []
  );

  return {
    templateContext,
    isLoading,
    generateEmail,
    refreshContext: loadTemplateContext,
  };
}
