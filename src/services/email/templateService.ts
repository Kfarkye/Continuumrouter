import { supabase } from '../../lib/supabaseClient';
import {
  EmailDraft,
  EmailSentLog,
  TemplatePerformance,
  UnifiedEmailData,
} from '../../types/templates/emailTypes';

export class TemplateService {
  static async saveDraft(
    clinicianId: string,
    templateId: string | null,
    subject: string,
    body: string,
    recipientEmail: string
  ): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const draftData = {
      user_id: user.id,
      clinician_id: clinicianId,
      template_id: templateId,
      subject,
      body,
      recipient_email: recipientEmail,
    };

    const { data: existingDraft } = await supabase
      .from('email_drafts')
      .select('id')
      .eq('clinician_id', clinicianId)
      .maybeSingle();

    if (existingDraft) {
      const { error } = await supabase
        .from('email_drafts')
        .update({ ...draftData, updated_at: new Date().toISOString() })
        .eq('id', existingDraft.id);

      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('email_drafts')
        .insert([draftData]);

      if (error) throw error;
    }
  }

  static async loadDraft(clinicianId: string): Promise<EmailDraft | null> {
    const { data, error } = await supabase
      .from('email_drafts')
      .select('*')
      .eq('clinician_id', clinicianId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  static async deleteDraft(clinicianId: string): Promise<void> {
    const { error } = await supabase
      .from('email_drafts')
      .delete()
      .eq('clinician_id', clinicianId);

    if (error) throw error;
  }

  static async logSentEmail(
    emailData: UnifiedEmailData,
    templateId: string | null,
    subject: string,
    body: string,
    recipientEmail: string
  ): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const logEntry = {
      user_id: user.id,
      clinician_id: emailData.clinicianId || null,
      assignment_id: emailData.assignmentId || null,
      template_id: templateId,
      recipient_email: recipientEmail,
      subject,
      body,
      sent_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('email_sent_log')
      .insert([logEntry]);

    if (error) throw error;
  }

  static async getEmailHistory(
    clinicianId: string,
    limit: number = 10
  ): Promise<EmailSentLog[]> {
    const { data, error } = await supabase
      .from('email_sent_log')
      .select('*')
      .eq('clinician_id', clinicianId)
      .order('sent_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  static async updateEmailOutcome(
    emailId: string,
    outcome: 'responded' | 'no_response' | 'bounced',
    responseReceivedAt?: string
  ): Promise<void> {
    const updateData: any = { outcome };
    if (responseReceivedAt) {
      updateData.response_received_at = responseReceivedAt;
    }

    const { error } = await supabase
      .from('email_sent_log')
      .update(updateData)
      .eq('id', emailId);

    if (error) throw error;
  }

  static async getTemplatePerformance(
    templateId: string
  ): Promise<TemplatePerformance | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('template_performance')
      .select('*')
      .eq('user_id', user.id)
      .eq('template_id', templateId)
      .maybeSingle();

    if (error) throw error;

    if (!data) return null;

    const avgResponseTimeHours =
      data.total_responded > 0
        ? data.total_response_time_hours / data.total_responded
        : 0;

    const responseRate =
      data.total_sent > 0 ? data.total_responded / data.total_sent : 0;

    const conversionRate =
      data.total_sent > 0 ? data.total_conversions / data.total_sent : 0;

    return {
      templateId: data.template_id,
      totalSent: data.total_sent,
      responseRate,
      avgResponseTimeHours,
      conversionRate,
      lastUsed: data.last_used_at,
    };
  }

  static async getAllTemplatePerformance(): Promise<TemplatePerformance[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('template_performance')
      .select('*')
      .eq('user_id', user.id)
      .order('total_sent', { ascending: false });

    if (error) throw error;

    return (data || []).map((d) => ({
      templateId: d.template_id,
      totalSent: d.total_sent,
      responseRate: d.total_sent > 0 ? d.total_responded / d.total_sent : 0,
      avgResponseTimeHours:
        d.total_responded > 0 ? d.total_response_time_hours / d.total_responded : 0,
      conversionRate: d.total_sent > 0 ? d.total_conversions / d.total_sent : 0,
      lastUsed: d.last_used_at,
    }));
  }

  static async getRecentEmails(limit: number = 20): Promise<EmailSentLog[]> {
    const { data, error } = await supabase
      .from('email_sent_log')
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  static async getClinicianEmailStats(clinicianId: string): Promise<{
    totalSent: number;
    lastEmailSent: string | null;
    responseRate: number;
  }> {
    const { data, error } = await supabase
      .from('email_sent_log')
      .select('*')
      .eq('clinician_id', clinicianId);

    if (error) throw error;

    const emails = data || [];
    const totalSent = emails.length;
    const responded = emails.filter((e) => e.outcome === 'responded').length;
    const lastEmail = emails.length > 0 ? emails[0].sent_at : null;

    return {
      totalSent,
      lastEmailSent: lastEmail,
      responseRate: totalSent > 0 ? responded / totalSent : 0,
    };
  }
}
