import React, { useState, useEffect } from 'react';
import { Mail, Calendar, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { UnifiedEmailModal } from './UnifiedEmailModal';
import { dashboardRowToUnified } from '../services/email/dataAdapters';
import { RecruiterDashboardRow } from '../types';
import toast from 'react-hot-toast';

export const RecruiterDashboard: React.FC = () => {
  const [dashboardData, setDashboardData] = useState<RecruiterDashboardRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedClinician, setSelectedClinician] = useState<RecruiterDashboardRow | null>(null);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('recruiter_dashboard')
        .select('*')
        .order('priority_order', { ascending: true })
        .order('end_date', { ascending: true });

      if (error) throw error;
      setDashboardData(data || []);
    } catch (error) {
      console.error('Error loading dashboard:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendEmail = (clinician: RecruiterDashboardRow) => {
    setSelectedClinician(clinician);
    setIsEmailModalOpen(true);
  };

  const getPriorityColor = (triggerType: string) => {
    switch (triggerType) {
      case 'extend_or_explore':
        return 'text-red-400 bg-red-500/10 border-red-500/20';
      case 'check_in':
        return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
      default:
        return 'text-green-400 bg-green-500/10 border-green-500/20';
    }
  };

  const getPriorityLabel = (triggerType: string) => {
    switch (triggerType) {
      case 'extend_or_explore':
        return 'Extension Needed';
      case 'check_in':
        return 'Check-In';
      default:
        return 'On Track';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-white/60">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Recruiter Dashboard</h2>
        <button
          onClick={loadDashboardData}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
        >
          Refresh
        </button>
      </div>

      {dashboardData.length === 0 ? (
        <div className="bg-zinc-900 rounded-lg border border-white/10 p-8 text-center">
          <p className="text-white/60">No active clinician assignments found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {dashboardData.map((clinician) => (
            <div
              key={clinician.clinician_id}
              className="bg-zinc-900 rounded-lg border border-white/10 p-4 hover:border-white/20 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-white">
                      {clinician.full_name}
                    </h3>
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full border ${getPriorityColor(
                        clinician.trigger_type
                      )}`}
                    >
                      {getPriorityLabel(clinician.trigger_type)}
                    </span>
                  </div>

                  <div className="space-y-1 text-sm text-white/60">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4" />
                      <span>{clinician.email}</span>
                      {clinician.phone && (
                        <>
                          <span className="text-white/30">•</span>
                          <span>{clinician.phone}</span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      <span>{clinician.facility_name}</span>
                      <span className="text-white/30">•</span>
                      <span>
                        {new Date(clinician.start_date).toLocaleDateString()} -{' '}
                        {new Date(clinician.end_date).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      <span className="font-medium">
                        {clinician.days_remaining} days remaining
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleSendEmail(clinician)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors whitespace-nowrap"
                >
                  <Mail className="w-4 h-4" />
                  Send Email
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedClinician && (
        <UnifiedEmailModal
          isOpen={isEmailModalOpen}
          onClose={() => {
            setIsEmailModalOpen(false);
            setSelectedClinician(null);
          }}
          emailData={dashboardRowToUnified(selectedClinician)}
        />
      )}
    </div>
  );
};
