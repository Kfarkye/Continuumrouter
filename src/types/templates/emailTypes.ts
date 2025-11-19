export type TemplateStage = 'prospect' | 'active';
export type TemplateCategory = 'outreach' | 'ops' | 'response' | 'assignment';

export interface ExtractedOfferData {
  name: string;
  email: string;
  facility: string;
  city: string;
  state: string;
  shiftType: string;
  weeklyHours: number;
  startDate: string | null;
  endDate: string | null;
  taxableRate: number;
  weeklyStipend: number;
  grossWeeklyPay: number;
  specialty: string;
  jobId: number | null;
  candidateId: number | null;
}

export interface UnifiedEmailData {
  clinicianId?: string;
  assignmentId?: string;
  name: string;
  email: string;
  phone?: string;
  facility: string;
  city: string;
  state: string;
  shiftType: string;
  weeklyHours: number;
  startDate: string | null;
  endDate: string | null;
  taxableRate: number;
  weeklyStipend: number;
  grossWeeklyPay: number;
  specialty: string;
  daysRemaining?: number;
  triggerType?: 'extend_or_explore' | 'check_in' | 'no_action';
  recruiterName?: string;
  accountManager?: string;
  assignmentCoordinator?: string;
  preferences?: string[];
  jobId?: number | null;
  candidateId?: number | null;
}

export interface EmailTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  stage: TemplateStage;
  description?: string;
  usageHint?: string;
  generateContent: (data: UnifiedEmailData) => {
    subject: string;
    body: string;
    to?: string;
  };
}

export interface EmailDraft {
  id: string;
  clinicianId?: string;
  userId: string;
  templateId?: string;
  subject: string;
  body: string;
  recipientEmail: string;
  attachmentIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface EmailSentLog {
  id: string;
  userId: string;
  clinicianId?: string;
  assignmentId?: string;
  templateId?: string;
  recipientEmail: string;
  subject: string;
  body: string;
  sentAt: string;
  outcome?: 'pending' | 'responded' | 'no_response' | 'bounced';
  responseReceivedAt?: string;
}

export interface TemplatePerformance {
  templateId: string;
  totalSent: number;
  responseRate: number;
  avgResponseTimeHours: number;
  conversionRate: number;
  lastUsed: string;
}
