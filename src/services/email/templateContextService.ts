import { ALL_TEMPLATES, getRecommendedTemplates } from '../../templates/unifiedTemplates';
import { UnifiedEmailData } from '../../types/templates/emailTypes';
import { supabase } from '../../lib/supabaseClient';

export class TemplateContextService {
  static getTemplateListForAI(): string {
    const templateList = ALL_TEMPLATES.map((t) => {
      return `- ${t.name} (ID: ${t.id})
  Category: ${t.category} | Stage: ${t.stage}
  ${t.description ? `Description: ${t.description}` : ''}
  ${t.usageHint ? `When to use: ${t.usageHint}` : ''}`;
    }).join('\n\n');

    return `# Available Email Templates

You have access to the following professional email templates for recruiters. You can generate emails using these templates by requesting them in the conversation.

${templateList}

## How to Use Templates

When a user asks for an email, you can:
1. Recommend the most appropriate template based on context
2. Generate the email content using template variables
3. Customize the template for the specific situation

## Template Variables

Templates use the following data:
- Clinician info: name, email, phone
- Assignment details: facility, location, dates, shift type
- Compensation: taxable rate, stipend, gross weekly pay
- Timeline: days remaining, trigger type (urgent/check-in/on-track)
- Team: recruiter name, account manager, coordinator

## Example Usage

User: "Draft an extension email for Sarah at Stanford"
You: "I'll create an extension request email for Sarah. Based on her assignment timeline, I recommend the 'Extension Request' template..."`;
  }

  static async getClinicianContext(clinicianId: string): Promise<string | null> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .rpc('get_clinician_context', {
          p_clinician_id: clinicianId,
          p_user_id: user.id,
        });

      if (error) throw error;
      if (!data) return null;

      const profile = data.profile || {};
      const assignment = data.assignment || {};
      const memories = data.memories || [];

      let context = `# Clinician Context\n\n`;
      context += `**Name:** ${profile.full_name || 'Unknown'}\n`;
      context += `**Email:** ${profile.email || 'Unknown'}\n`;
      if (profile.phone) context += `**Phone:** ${profile.phone}\n`;

      if (assignment.facility_name) {
        context += `\n## Current Assignment\n\n`;
        context += `**Facility:** ${assignment.facility_name}\n`;
        context += `**Dates:** ${assignment.start_date || 'TBD'} to ${assignment.end_date || 'TBD'}\n`;

        if (assignment.days_remaining !== undefined) {
          context += `**Days Remaining:** ${assignment.days_remaining}\n`;

          if (assignment.days_remaining <= 28) {
            context += `**URGENCY:** 🔴 CRITICAL - Extension decision needed immediately\n`;
          } else if (assignment.days_remaining <= 42) {
            context += `**URGENCY:** 🟠 HIGH - Begin extension conversation\n`;
          } else if (assignment.days_remaining <= 56) {
            context += `**URGENCY:** 🟡 MEDIUM - Check-in time\n`;
          }
        }
      }

      if (memories.length > 0) {
        context += `\n## Important Notes\n\n`;
        memories.forEach((mem: any, idx: number) => {
          context += `${idx + 1}. [${mem.type}] ${mem.content}\n`;
        });
      }

      return context;
    } catch (error) {
      console.error('Error getting clinician context:', error);
      return null;
    }
  }

  static generateTemplatePrompt(clinicianData?: UnifiedEmailData): string {
    let prompt = this.getTemplateListForAI();

    if (clinicianData) {
      prompt += `\n\n## Current Context\n\n`;
      prompt += `You are composing an email for: ${clinicianData.name}\n`;
      if (clinicianData.facility) {
        prompt += `Current facility: ${clinicianData.facility}\n`;
      }
      if (clinicianData.daysRemaining !== undefined) {
        prompt += `Days remaining in assignment: ${clinicianData.daysRemaining}\n`;

        const recommended = getRecommendedTemplates(clinicianData);
        if (recommended.length > 0) {
          prompt += `\nRecommended templates:\n`;
          recommended.forEach(t => {
            prompt += `- ${t.name} (${t.id})\n`;
          });
        }
      }
    }

    return prompt;
  }

  static formatTemplateForChat(templateId: string, emailData: UnifiedEmailData): string {
    const template = ALL_TEMPLATES.find(t => t.id === templateId);
    if (!template) return 'Template not found';

    const generated = template.generateContent(emailData);

    return `# ${template.name}

**Category:** ${template.category} | **Stage:** ${template.stage}

---

**To:** ${generated.to || emailData.email}

**Subject:** ${generated.subject}

**Body:**

${generated.body}

---

*This email was generated using the ${template.name} template. You can edit it before sending via the Dashboard.*`;
  }

  static async getCustomTemplates(): Promise<any[]> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting custom templates:', error);
      return [];
    }
  }
}
