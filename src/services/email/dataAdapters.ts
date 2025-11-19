import { ExtractedOfferData, UnifiedEmailData } from '../../types/templates/emailTypes';
import { ClinicianProfile, Assignment } from '../../types';

export function extractedOfferToUnified(data: ExtractedOfferData): UnifiedEmailData {
  return {
    name: data.name,
    email: data.email,
    facility: data.facility,
    city: data.city,
    state: data.state,
    shiftType: data.shiftType,
    weeklyHours: data.weeklyHours,
    startDate: data.startDate,
    endDate: data.endDate,
    taxableRate: data.taxableRate,
    weeklyStipend: data.weeklyStipend,
    grossWeeklyPay: data.grossWeeklyPay,
    specialty: data.specialty,
    jobId: data.jobId,
    candidateId: data.candidateId,
  };
}

export function clinicianToUnified(
  clinician: ClinicianProfile,
  assignment?: Assignment,
  additionalData?: Partial<UnifiedEmailData>
): UnifiedEmailData {
  const daysRemaining = assignment?.end_date
    ? Math.ceil((new Date(assignment.end_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : undefined;

  const triggerType =
    daysRemaining !== undefined
      ? daysRemaining <= 42
        ? 'extend_or_explore'
        : daysRemaining <= 56
        ? 'check_in'
        : 'no_action'
      : undefined;

  return {
    clinicianId: clinician.id,
    assignmentId: assignment?.id,
    name: clinician.full_name,
    email: clinician.email,
    phone: clinician.phone || undefined,
    facility: assignment?.facility_name || additionalData?.facility || 'TBD',
    city: additionalData?.city || '',
    state: additionalData?.state || '',
    shiftType: additionalData?.shiftType || 'TBD',
    weeklyHours: additionalData?.weeklyHours || 36,
    startDate: assignment?.start_date || additionalData?.startDate || null,
    endDate: assignment?.end_date || additionalData?.endDate || null,
    taxableRate: additionalData?.taxableRate || 0,
    weeklyStipend: additionalData?.weeklyStipend || 0,
    grossWeeklyPay: additionalData?.grossWeeklyPay || 0,
    specialty: additionalData?.specialty || '',
    daysRemaining,
    triggerType,
    recruiterName: additionalData?.recruiterName,
    accountManager: additionalData?.accountManager,
    assignmentCoordinator: additionalData?.assignmentCoordinator,
    preferences: additionalData?.preferences,
  };
}

export function dashboardRowToUnified(row: any): UnifiedEmailData {
  const daysRemaining = row.days_remaining;
  const triggerType = row.trigger_type;

  return {
    clinicianId: row.clinician_id,
    name: row.full_name,
    email: row.email,
    phone: row.phone || undefined,
    facility: row.facility_name,
    city: '',
    state: '',
    shiftType: 'TBD',
    weeklyHours: 36,
    startDate: row.start_date,
    endDate: row.end_date,
    taxableRate: 0,
    weeklyStipend: 0,
    grossWeeklyPay: 0,
    specialty: '',
    daysRemaining,
    triggerType,
  };
}

export const currency = (n?: number | null): string =>
  n == null ? '' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n));

export const shortDate = (ds?: string | null, fallback: string = 'ASAP'): string => {
  if (!ds) return fallback;
  const d = new Date(`${ds}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? fallback
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const formatCurrencyRate = (rate?: number | null): string => {
  if (rate == null || Number.isNaN(Number(rate)) || Number(rate) === 0) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(rate));
};

export const getFirstName = (fullName: string): string => fullName.split(' ')[0] || '';

export const getFacilityName = (name: string): string => name.replace(' at ', ' ').trim();
