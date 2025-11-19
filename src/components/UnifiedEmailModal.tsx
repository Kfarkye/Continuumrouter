import React, { useState, useEffect, useCallback } from 'react';
import { X, Send, FileText, ChevronDown } from 'lucide-react';
import { UnifiedEmailData, EmailTemplate } from '../types/templates/emailTypes';
import {
  ALL_TEMPLATES,
  getTemplatesForStage,
  getTemplateById,
  getCategoryDisplayName,
  getRecommendedTemplates,
} from '../templates/unifiedTemplates';
import { supabase } from '../lib/supabaseClient';
import toast from 'react-hot-toast';

interface UnifiedEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  emailData: UnifiedEmailData;
  onSend?: (subject: string, body: string, recipientEmail: string) => Promise<void>;
}

export const UnifiedEmailModal: React.FC<UnifiedEmailModalProps> = ({
  isOpen,
  onClose,
  emailData,
  onSend,
}) => {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipientEmail, setRecipientEmail] = useState(emailData.email || '');
  const [isSending, setIsSending] = useState(false);
  const [stage, setStage] = useState<'prospect' | 'active'>(
    emailData.assignmentId ? 'active' : 'prospect'
  );
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);

  const availableTemplates = getTemplatesForStage(stage);
  const recommendedTemplates = getRecommendedTemplates(emailData);

  useEffect(() => {
    setRecipientEmail(emailData.email || '');
  }, [emailData.email]);

  useEffect(() => {
    if (isOpen && emailData.clinicianId) {
      loadDraft();
    }
  }, [isOpen, emailData.clinicianId]);

  const loadDraft = async () => {
    if (!emailData.clinicianId) return;

    try {
      const { data, error } = await supabase
        .from('email_drafts')
        .select('*')
        .eq('clinician_id', emailData.clinicianId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSubject(data.subject);
        setBody(data.body);
        setRecipientEmail(data.recipient_email);
        if (data.template_id) {
          setSelectedTemplateId(data.template_id);
        }
      }
    } catch (error) {
      console.error('Error loading draft:', error);
    }
  };

  const saveDraft = useCallback(async () => {
    if (!emailData.clinicianId) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const draftData = {
        user_id: user.id,
        clinician_id: emailData.clinicianId,
        template_id: selectedTemplateId,
        subject,
        body,
        recipient_email: recipientEmail,
        updated_at: new Date().toISOString(),
      };

      const { data: existingDraft } = await supabase
        .from('email_drafts')
        .select('id')
        .eq('clinician_id', emailData.clinicianId)
        .maybeSingle();

      if (existingDraft) {
        await supabase
          .from('email_drafts')
          .update(draftData)
          .eq('id', existingDraft.id);
      } else {
        await supabase.from('email_drafts').insert([draftData]);
      }
    } catch (error) {
      console.error('Error saving draft:', error);
    }
  }, [emailData.clinicianId, selectedTemplateId, subject, body, recipientEmail]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (subject || body) {
        saveDraft();
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [subject, body, saveDraft]);

  const handleTemplateSelect = (templateId: string) => {
    const template = getTemplateById(templateId);
    if (!template) return;

    const generated = template.generateContent(emailData);
    setSubject(generated.subject);
    setBody(generated.body);
    if (generated.to) {
      setRecipientEmail(generated.to);
    }
    setSelectedTemplateId(templateId);
    setShowTemplateDropdown(false);
  };

  const handleSend = async () => {
    if (!subject.trim() || !body.trim() || !recipientEmail.trim()) {
      toast.error('Please fill in all fields');
      return;
    }

    setIsSending(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const logEntry = {
        user_id: user.id,
        clinician_id: emailData.clinicianId || null,
        assignment_id: emailData.assignmentId || null,
        template_id: selectedTemplateId,
        recipient_email: recipientEmail,
        subject,
        body,
        sent_at: new Date().toISOString(),
      };

      const { error: logError } = await supabase
        .from('email_sent_log')
        .insert([logEntry]);

      if (logError) throw logError;

      if (onSend) {
        await onSend(subject, body, recipientEmail);
      } else {
        const mailtoLink = `mailto:${recipientEmail}?subject=${encodeURIComponent(
          subject
        )}&body=${encodeURIComponent(body)}`;
        window.open(mailtoLink, '_blank');
      }

      if (emailData.clinicianId) {
        await supabase
          .from('email_drafts')
          .delete()
          .eq('clinician_id', emailData.clinicianId);
      }

      toast.success('Email opened in your mail client');
      onClose();
    } catch (error) {
      console.error('Error sending email:', error);
      toast.error('Failed to log email');
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  const groupedTemplates = availableTemplates.reduce((acc, template) => {
    const category = template.category;
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(template);
    return acc;
  }, {} as Record<string, EmailTemplate[]>);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-white/10">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-xl font-semibold text-white">Compose Email</h2>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setStage('prospect')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                stage === 'prospect'
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-800 text-white/60 hover:bg-zinc-700'
              }`}
            >
              Prospect
            </button>
            <button
              onClick={() => setStage('active')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                stage === 'active'
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-800 text-white/60 hover:bg-zinc-700'
              }`}
            >
              Active Assignment
            </button>
          </div>

          {recommendedTemplates.length > 0 && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
              <h3 className="text-sm font-medium text-blue-400 mb-2">Recommended Templates</h3>
              <div className="flex flex-wrap gap-2">
                {recommendedTemplates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleTemplateSelect(template.id)}
                    className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-sm rounded-lg transition-colors"
                  >
                    {template.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="relative">
            <button
              onClick={() => setShowTemplateDropdown(!showTemplateDropdown)}
              className="w-full flex items-center justify-between px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                <span>
                  {selectedTemplateId
                    ? getTemplateById(selectedTemplateId)?.name || 'Select Template'
                    : 'Select Template'}
                </span>
              </div>
              <ChevronDown className="w-4 h-4" />
            </button>

            {showTemplateDropdown && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-800 border border-white/10 rounded-lg shadow-xl max-h-96 overflow-y-auto z-10">
                {Object.entries(groupedTemplates).map(([category, templates]) => (
                  <div key={category} className="border-b border-white/5 last:border-b-0">
                    <div className="px-4 py-2 bg-zinc-900/50 text-xs font-semibold text-white/60 uppercase tracking-wider">
                      {getCategoryDisplayName(category)}
                    </div>
                    {templates.map((template) => (
                      <button
                        key={template.id}
                        onClick={() => handleTemplateSelect(template.id)}
                        className="w-full text-left px-4 py-3 hover:bg-zinc-700 text-white transition-colors flex flex-col gap-1"
                      >
                        <span className="font-medium">{template.name}</span>
                        {template.description && (
                          <span className="text-xs text-white/60">{template.description}</span>
                        )}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">To</label>
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              className="w-full px-4 py-2 bg-zinc-800 text-white rounded-lg border border-white/10 focus:border-blue-500 focus:outline-none"
              placeholder="recipient@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-4 py-2 bg-zinc-800 text-white rounded-lg border border-white/10 focus:border-blue-500 focus:outline-none"
              placeholder="Email subject"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={12}
              className="w-full px-4 py-2 bg-zinc-800 text-white rounded-lg border border-white/10 focus:border-blue-500 focus:outline-none resize-none font-mono text-sm"
              placeholder="Email body"
            />
          </div>
        </div>

        <div className="flex items-center justify-between p-4 border-t border-white/10">
          <div className="text-xs text-white/40">
            {emailData.clinicianId && 'Draft auto-saved'}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={isSending || !subject.trim() || !body.trim() || !recipientEmail.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-white/40 text-white rounded-lg transition-colors"
            >
              <Send className="w-4 h-4" />
              {isSending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
