import { useState, useCallback } from 'react';
import { UnifiedEmailData } from '../types/templates/emailTypes';
import { TemplateService } from '../services/email/templateService';
import toast from 'react-hot-toast';

export function useEmailComposer(emailData: UnifiedEmailData) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const openComposer = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  const closeComposer = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const sendEmail = useCallback(
    async (subject: string, body: string, recipientEmail: string, templateId?: string | null) => {
      setIsSending(true);
      try {
        await TemplateService.logSentEmail(
          emailData,
          templateId || null,
          subject,
          body,
          recipientEmail
        );

        if (emailData.clinicianId) {
          await TemplateService.deleteDraft(emailData.clinicianId);
        }

        const mailtoLink = `mailto:${recipientEmail}?subject=${encodeURIComponent(
          subject
        )}&body=${encodeURIComponent(body)}`;
        window.open(mailtoLink, '_blank');

        toast.success('Email opened in your mail client');
        closeComposer();
      } catch (error) {
        console.error('Error sending email:', error);
        toast.error('Failed to send email');
        throw error;
      } finally {
        setIsSending(false);
      }
    },
    [emailData, closeComposer]
  );

  return {
    isModalOpen,
    isSending,
    openComposer,
    closeComposer,
    sendEmail,
  };
}
