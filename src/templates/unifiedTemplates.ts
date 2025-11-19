import { EmailTemplate, UnifiedEmailData } from '../types/templates/emailTypes';
import { currency, shortDate, formatCurrencyRate, getFirstName, getFacilityName } from '../services/email/dataAdapters';

export const OUTREACH_TEMPLATES: EmailTemplate[] = [
  {
    id: 'initial_outreach',
    name: '📧 EMAIL: Initial Outreach – Full Details',
    category: 'outreach',
    stage: 'prospect',
    description: 'Comprehensive job offer with full pay breakdown',
    usageHint: 'Use for first contact with new prospects',
    generateContent: (d) => ({
      subject: `${d.specialty} Assignment – ${d.facility} | ${currency(d.grossWeeklyPay)}/week`,
      to: d.email,
      body: `Hi ${getFirstName(d.name)},

Thanks for your interest in the ${d.specialty} position at ${d.facility}. Here's the full breakdown — this looks like an excellent match for your background:

Facility: ${d.facility}
Location: ${d.city}, ${d.state}
Assignment Dates: ${shortDate(d.startDate)} – ${shortDate(d.endDate)}
Shifts & Hours: ${d.shiftType} (${d.weeklyHours} hours/week)

Pay Package:
Taxable Hourly Rate: ${currency(d.taxableRate)}/hr
Meals & Housing Stipend: ${currency(d.weeklyStipend)}/week
Total Gross Weekly Pay: ${currency(d.grossWeeklyPay)}

This role is moving quickly — I can get you submitted today if everything looks good.

To move forward, just confirm:
- Are you available to start ${shortDate(d.startDate)}?
- Do you have any time-off requests during the contract?
- Is your Aya profile current (work history, certs, skills checklist)?

Please let me know if you have any questions.

Thank you!`,
    }),
  },
  {
    id: 'hourly_rate_outreach',
    name: '📧 EMAIL: Hourly Rate Offer',
    category: 'outreach',
    stage: 'prospect',
    description: 'Simplified offer focusing on hourly rate',
    generateContent: (d) => {
      const firstName = getFirstName(d.name);
      const hourlyRate = formatCurrencyRate(d.taxableRate + (d.weeklyStipend / (d.weeklyHours || 40)));
      const facilityName = getFacilityName(d.facility);

      return {
        subject: `${d.specialty || '[Specialty]'} Assignment – ${facilityName || '[Facility Name]'} | ${hourlyRate}/hr`,
        to: d.email,
        body: `Hi ${firstName || '[First Name]'},

Thanks for your interest in the ${d.specialty || '[Specialty]'} position at ${facilityName || '[Facility Name]'}.
Here's the full breakdown — this looks like a great match for your background:

Facility: ${facilityName || '[Facility Name]'}
Location: ${d.city || '[City]'}, ${d.state || '[State]'}
Assignment Dates: ${shortDate(d.startDate)} – ${shortDate(d.endDate)}
Shifts & Hours: ${d.shiftType || '[Shift Type]'} (${d.weeklyHours}hrs/week)
Hourly Rate: ${hourlyRate}/hr

This role is moving quickly — I can get you submitted today if everything looks good.

To move forward, just confirm:

Are you available to start ${shortDate(d.startDate)}?
Do you have any time-off requests during the contract?
Is your Aya profile current (work history, certs, skills checklist)?

Please let me know if you have any questions.

Thank you!`,
      };
    },
  },
  {
    id: 'reengagement',
    name: '📧 EMAIL: Re-engagement – Full Details Pitch',
    category: 'outreach',
    stage: 'prospect',
    description: 'Re-engage past prospects with new opportunity',
    generateContent: (d) => ({
      subject: `${d.facility} Assignment in ${d.city}, ${d.state} - ${currency(d.grossWeeklyPay)}/week`,
      to: d.email,
      body: `Hi ${getFirstName(d.name)},

It's been a while, I hope you're doing great!

I was scrolling through assignments and immediately thought of you for this great ${d.specialty} role, given your background. Here are the full details:

Facility: ${d.facility}
Location: ${d.city}, ${d.state}
Assignment Dates: ${shortDate(d.startDate)} – ${shortDate(d.endDate)}
Shifts & Hours: ${d.shiftType} (${d.weeklyHours} hours/week)

Pay Package:
Taxable Hourly Rate: ${currency(d.taxableRate)}/hr
Meals & Housing Stipend: ${currency(d.weeklyStipend)}/week
Total Gross Weekly Pay: ${currency(d.grossWeeklyPay)}

This is a highly competitive role, and I'd love to get your file submitted right away.

Are you available to start ${shortDate(d.startDate)}, or when would be the best time for you to start your next travel assignment?

Let me know if you have any questions!

Best,
${d.recruiterName || '[Your name]'}`,
    }),
  },
  {
    id: 'competitive_offer',
    name: '📧 EMAIL: Competitive Counter Offer',
    category: 'outreach',
    stage: 'prospect',
    description: 'Counter offer to beat competitor',
    generateContent: (d) => {
      const enhancedPay = d.grossWeeklyPay * 1.05;

      return {
        subject: `${getFirstName(d.name)}, we can beat that offer`,
        to: d.email,
        body: `Hi ${getFirstName(d.name)},

I heard you might be considering another opportunity. Before you make a decision, let me share what we can offer:

${d.facility} - ${d.city}, ${d.state}
• ${currency(enhancedPay)}/week (enhanced rate)
• Completion bonus available
• Guaranteed hours
• Day 1 health benefits
• Free private housing option

Plus, with Aya you get:
• 24/7 clinical support
• License reimbursement
• Travel reimbursement up to $500

Can we talk for 5 minutes? I think you'll be pleasantly surprised.

${d.recruiterName || '[Your name]'}`,
      };
    },
  },
  {
    id: 'referral_request',
    name: '📧 EMAIL: Referral Request',
    category: 'outreach',
    stage: 'active',
    description: 'Request referrals from happy clinicians',
    generateContent: (d) => ({
      subject: `${getFirstName(d.name)}, know any ${d.specialty}s looking?`,
      to: d.email,
      body: `Hi ${getFirstName(d.name)},

Quick question — do you know any other ${d.specialty}s who might be looking for their next assignment?

I have this great opportunity at ${d.facility}:
• ${currency(d.grossWeeklyPay)}/week
• ${d.city}, ${d.state}
• ${d.shiftType} shift

If you refer someone who takes an assignment, you'll get a $500 referral bonus!

Even if this specific role isn't a fit, I have others. Any names come to mind?

Thanks!
${d.recruiterName || '[Your name]'}`,
    }),
  },
];

export const ASSIGNMENT_TEMPLATES: EmailTemplate[] = [
  {
    id: 'extension_request',
    name: '📧 ASSIGNMENT: Extension Request',
    category: 'assignment',
    stage: 'active',
    description: 'Request extension for expiring assignment',
    usageHint: 'Use when assignment is 6 weeks or less from end date',
    generateContent: (d) => {
      const urgencyLevel =
        (d.daysRemaining ?? 100) <= 28 ? 'URGENT' :
        (d.daysRemaining ?? 100) <= 42 ? 'Important' : '';

      return {
        subject: `${urgencyLevel ? urgencyLevel + ': ' : ''}Extension Opportunity at ${d.facility}`,
        to: d.email,
        body: `Hi ${getFirstName(d.name)},

I hope everything is going great at ${d.facility}! ${d.daysRemaining ? `With ${d.daysRemaining} days remaining on your current assignment, ` : ''}I wanted to reach out about extension opportunities.

Current Assignment:
Facility: ${d.facility}
End Date: ${shortDate(d.endDate)}
${d.daysRemaining ? `Days Remaining: ${d.daysRemaining}` : ''}

Would you be interested in extending at ${d.facility}? Or would you prefer to explore new opportunities?

If you'd like to extend, I can reach out to the facility right away. If you're ready for something new, I have several great options in your specialty.

Let me know what you're thinking!

Best,
${d.recruiterName || '[Your name]'}`,
      };
    },
  },
  {
    id: 'check_in_mid_assignment',
    name: '📧 ASSIGNMENT: Mid-Assignment Check-In',
    category: 'assignment',
    stage: 'active',
    description: 'Check in during active assignment',
    usageHint: 'Use 6-8 weeks before assignment end',
    generateContent: (d) => ({
      subject: `Checking In - ${d.facility}`,
      to: d.email,
      body: `Hi ${getFirstName(d.name)},

I hope things are going well at ${d.facility}! Just wanted to check in and see how everything is going.

Quick questions:
- How's the assignment going so far?
- Any concerns or issues I can help with?
- Have you thought about your plans after ${shortDate(d.endDate)}?

I'm here to support you, whether that's extending at ${d.facility} or finding your next great opportunity.

Let me know if you need anything!

Best,
${d.recruiterName || '[Your name]'}`,
    }),
  },
  {
    id: 'margin_approval_request',
    name: '📧 ASSIGNMENT: Margin Approval Request',
    category: 'assignment',
    stage: 'active',
    description: 'Request approval for adjusted margin',
    usageHint: 'Internal use for operations team',
    generateContent: (d) => ({
      subject: `Margin Approval Needed - ${getFirstName(d.name)} at ${d.facility}`,
      to: 'operations@ayahealthcare.com',
      body: `Hi Team,

I need margin approval for the following extension:

Clinician: ${d.name}
Facility: ${d.facility}
Current Assignment End Date: ${shortDate(d.endDate)}
Proposed Extension: [Add dates]

Current Pay Package: ${currency(d.grossWeeklyPay)}/week
Proposed Adjustment: [Add details]

Justification: [Add business case]

Please review and approve at your earliest convenience.

Thank you,
${d.recruiterName || '[Your name]'}`,
    }),
  },
];

export const TEXT_TEMPLATES: EmailTemplate[] = [
  {
    id: 'text_quick_pitch',
    name: '💬 TEXT: Quick Pitch',
    category: 'outreach',
    stage: 'prospect',
    description: 'Brief text message pitch',
    generateContent: (d) => {
      const mealsStipend = d.weeklyStipend ? currency(d.weeklyStipend * 0.4) : '—';
      const housingStipend = d.weeklyStipend ? currency(d.weeklyStipend * 0.6) : '—';

      return {
        subject: 'Text Message',
        to: d.phone || d.email,
        body: `Hi ${getFirstName(d.name)}! Quick heads up on an amazing opportunity:

Facility: ${d.facility}
Location: ${d.city}, ${d.state}
Dates: ${shortDate(d.startDate)} – ${shortDate(d.endDate)}
Shifts: ${d.shiftType} (${d.weeklyHours}hrs/wk)
Specialty: ${d.specialty}

Pay Package:
${currency(d.taxableRate)}/hr + ${mealsStipend}/wk meals + ${housingStipend}/wk housing
= ${currency(d.grossWeeklyPay)}/wk total

Let me know if you'd like to be submitted or have questions!`,
      };
    },
  },
  {
    id: 'text_extension_check',
    name: '💬 TEXT: Extension Check',
    category: 'assignment',
    stage: 'active',
    description: 'Quick text to check extension interest',
    generateContent: (d) => ({
      subject: 'Text Message',
      to: d.phone || d.email,
      body: `Hi ${getFirstName(d.name)} - Your assignment at ${d.facility} ends ${shortDate(d.endDate)}. Interested in extending or ready for something new? Let me know!`,
    }),
  },
  {
    id: 'text_urgent',
    name: '💬 TEXT: Urgent – Fast Decision',
    category: 'outreach',
    stage: 'prospect',
    description: 'Urgent opportunity requiring quick response',
    generateContent: (d) => ({
      subject: 'Text Message',
      to: d.phone || d.email,
      body: `${getFirstName(d.name)} - URGENT: ${d.facility} needs ${d.specialty} by ${shortDate(d.startDate)}. ${currency(d.grossWeeklyPay)}/wk. They're deciding TODAY. Can you talk now? Call me at [phone] or reply YES.`,
    }),
  },
];

export const OPS_TEMPLATES: EmailTemplate[] = [
  {
    id: 'ops_reassignment',
    name: '🛠 OPS: Reassignment Request',
    category: 'ops',
    stage: 'active',
    description: 'Request clinician reassignment to different recruiter',
    generateContent: (d) => {
      const novaUrl = d.candidateId
        ? `https://nova.ayahealthcare.com/#/recruiting/candidates/${d.candidateId}/new-profile/about`
        : 'Not Available';

      return {
        to: 'reassignments@ayahealthcare.com',
        subject: `Reassignment Request – ${d.name}`,
        body: `Hi Team,

Can we please reassign ${d.name}?

Email: ${d.email || 'Not Available'}
Nova Profile: ${novaUrl}

Thank you!`,
      };
    },
  },
  {
    id: 'ops_documents_and_references',
    name: '🛠 OPS: Documents & References',
    category: 'ops',
    stage: 'prospect',
    description: 'Request required documents from candidate',
    generateContent: (d) => ({
      subject: `Items Needed to Complete Your Application - ${d.specialty} Position`,
      to: d.email,
      body: `Hi ${getFirstName(d.name)},

Awesome — thanks for confirming!

I'll need a couple more items to complete your file before submission:

• Please send me a copy of your ${d.specialty || 'certification'} so we can keep your file complete.
• I'll also need two supervisory references from the last two years (charge nurse, manager, or supervisor). I've attached a reference form; please have them email it to References@ayahealthcare.com and CC me.

Once we receive your certification and references, I'll move your application forward right away.

Process Timeline:
• Aya's clinical team reviews your file first
• Your profile is then sent to the facility's unit manager
• We typically hear back within 72 hours of submission

Your Benefits as an Aya Traveler:
• Day one medical, dental, and vision coverage
• Industry-leading 401k match (up to 4%)
• License reimbursements
• Sick time
• Dedicated support team — me as your recruiter + ${d.assignmentCoordinator || 'my assistant'}

I've attached the reference form and benefits guide as well. Happy to help with any questions.

Thank you!`,
    }),
  },
];

export const RESPONSE_TEMPLATES: EmailTemplate[] = [
  {
    id: 'response_ltc_and_references',
    name: '✉️ RESPONSE: LTC & Reference Request',
    category: 'response',
    stage: 'prospect',
    description: 'Response email with LTC and reference instructions',
    generateContent: (d) => ({
      to: d.email,
      subject: `Next Steps: ${d.facility || 'Your Application'}`,
      body: `Hi ${getFirstName(d.name)},

Awesome — thanks for confirming!

I'll need a couple more items to complete your file before submission:

• Please send me a copy of your LTC so we can keep your file complete.
• I'll also need two supervisory references from the last two years (charge nurse, manager, or supervisor). I've attached a reference form; please have them email it to References@ayahealthcare.com and CC me.

Once we receive your certification and references, I'll move your application forward right away.

Process Timeline:
• Aya's clinical team reviews your file first
• Your profile is then sent to the facility's unit manager
• We typically hear back within 72 hours of submission

Your Benefits as an Aya Traveler:
• Day one medical, dental, and vision coverage
• Industry-leading 401k match (up to 4%)
• License reimbursements
• Sick time
• Dedicated support team — me as your recruiter + ${d.assignmentCoordinator || 'my assistant'}

I've attached the reference form and benefits guide as well. Happy to help with any questions.

Thank you!`,
    }),
  },
];

export const ALL_TEMPLATES: EmailTemplate[] = [
  ...OUTREACH_TEMPLATES,
  ...ASSIGNMENT_TEMPLATES,
  ...TEXT_TEMPLATES,
  ...OPS_TEMPLATES,
  ...RESPONSE_TEMPLATES,
];

export function getTemplatesForStage(stage: 'prospect' | 'active'): EmailTemplate[] {
  return ALL_TEMPLATES.filter(t => t.stage === stage);
}

export function getTemplateById(id: string): EmailTemplate | undefined {
  return ALL_TEMPLATES.find(t => t.id === id);
}

export function getCategoryDisplayName(category: string): string {
  const names: Record<string, string> = {
    outreach: 'Outreach',
    ops: 'Operations',
    response: 'Response',
    assignment: 'Assignment Management',
  };
  return names[category] || category;
}

export function getTemplatesForCategory(category: string): EmailTemplate[] {
  return ALL_TEMPLATES.filter(t => t.category === category);
}

export function getRecommendedTemplates(data: UnifiedEmailData): EmailTemplate[] {
  const recommended: EmailTemplate[] = [];

  if (data.daysRemaining !== undefined) {
    if (data.daysRemaining <= 28) {
      const urgent = getTemplateById('extension_request');
      if (urgent) recommended.push(urgent);
    } else if (data.daysRemaining <= 42) {
      const extension = getTemplateById('extension_request');
      if (extension) recommended.push(extension);
    } else if (data.daysRemaining <= 56) {
      const checkIn = getTemplateById('check_in_mid_assignment');
      if (checkIn) recommended.push(checkIn);
    }
  }

  if (!data.clinicianId || !data.assignmentId) {
    const outreach = getTemplateById('initial_outreach');
    if (outreach) recommended.push(outreach);
  }

  return recommended;
}
