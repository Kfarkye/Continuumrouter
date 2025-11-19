import React, { useState, useEffect } from 'react';
import { useReplyAssistant } from '../hooks/useReplyAssistant';
import { MessageSquare, Send, Sparkles, Copy, Check, User, Info } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { ClinicianReplyContext } from '../types';

interface ReplyAssistantInterfaceProps {
  userId: string;
}

export function ReplyAssistantInterface({ userId }: ReplyAssistantInterfaceProps) {
  const {
    clinicians,
    messages,
    currentThread,
    isLoading,
    isGenerating,
    generateReply,
    selectReply,
    saveUserInput
  } = useReplyAssistant(userId);

  const [selectedClinicianId, setSelectedClinicianId] = useState<string>('');
  const [incomingText, setIncomingText] = useState('');
  const [userGoal, setUserGoal] = useState('');
  const [generatedReplies, setGeneratedReplies] = useState<{
    reply_1: string;
    reply_2: string;
    message_id: string;
  } | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [showContext, setShowContext] = useState(false);
  const [context, setContext] = useState<ClinicianReplyContext | null>(null);

  const selectedClinician = clinicians.find(c => c.id === selectedClinicianId);

  useEffect(() => {
    if (clinicians.length > 0 && !selectedClinicianId) {
      setSelectedClinicianId(clinicians[0].id);
    }
  }, [clinicians, selectedClinicianId]);

  const handleGenerateReply = async () => {
    if (!selectedClinicianId || !incomingText.trim()) {
      toast.error('Please select a clinician and enter their message');
      return;
    }

    await saveUserInput(selectedClinicianId, incomingText);

    const result = await generateReply(
      selectedClinicianId,
      incomingText,
      userGoal || undefined
    );

    if (result) {
      setGeneratedReplies(result);
    }
  };

  const handleSelectReply = async (reply: string, index: number) => {
    if (!generatedReplies) return;

    await selectReply(generatedReplies.message_id, reply);
    toast.success(`Reply ${index + 1} selected and saved`);

    setIncomingText('');
    setUserGoal('');
    setGeneratedReplies(null);
  };

  const handleCopyReply = async (reply: string, index: number) => {
    await navigator.clipboard.writeText(reply);
    setCopiedIndex(index);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-white/60">Loading...</div>
      </div>
    );
  }

  if (clinicians.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <MessageSquare className="w-16 h-16 text-white/20 mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">No Clinicians Found</h2>
        <p className="text-white/60 max-w-md">
          Import clinicians from the sidebar to start using the Reply Assistant.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-black">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6 space-y-6">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-white mb-2">Reply Assistant</h1>
              <p className="text-white/60">Generate AI-powered replies to clinician messages</p>
            </div>
            <Sparkles className="w-8 h-8 text-blue-400" />
          </div>

          <div className="bg-white/[0.02] border border-white/10 rounded-xl p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">
                Select Clinician
              </label>
              <select
                value={selectedClinicianId}
                onChange={(e) => setSelectedClinicianId(e.target.value)}
                className="w-full px-4 py-3 bg-white/[0.05] border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {clinicians.map(clinician => (
                  <option key={clinician.id} value={clinician.id} className="bg-zinc-900">
                    {clinician.full_name} ({clinician.email})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">
                Incoming Message from Clinician
              </label>
              <textarea
                value={incomingText}
                onChange={(e) => setIncomingText(e.target.value)}
                placeholder="Paste the message you received from the clinician..."
                className="w-full px-4 py-3 bg-white/[0.05] border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[120px]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">
                Your Goal (Optional)
              </label>
              <input
                type="text"
                value={userGoal}
                onChange={(e) => setUserGoal(e.target.value)}
                placeholder="e.g., Schedule a check-in call, Extend assignment, etc."
                className="w-full px-4 py-3 bg-white/[0.05] border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              onClick={handleGenerateReply}
              disabled={isGenerating || !incomingText.trim()}
              className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-blue-500/50 disabled:to-blue-600/50 text-white rounded-lg font-semibold transition-all flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  Generating Replies...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate Reply Options
                </>
              )}
            </button>
          </div>

          {generatedReplies && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Generated Replies</h3>

              {[generatedReplies.reply_1, generatedReplies.reply_2].map((reply, index) => (
                <div
                  key={index}
                  className="bg-white/[0.02] border border-white/10 rounded-xl p-6 space-y-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-blue-400 mb-2">
                        Option {index + 1}
                      </div>
                      <p className="text-white/90 whitespace-pre-wrap">{reply}</p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCopyReply(reply, index)}
                      className="flex-1 px-4 py-2 bg-white/[0.05] hover:bg-white/[0.08] border border-white/10 text-white rounded-lg font-medium transition-all flex items-center justify-center gap-2"
                    >
                      {copiedIndex === index ? (
                        <>
                          <Check className="w-4 h-4" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copy
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleSelectReply(reply, index)}
                      className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-all flex items-center justify-center gap-2"
                    >
                      <Check className="w-4 h-4" />
                      Use This Reply
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedClinician && (
            <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4">
              <div className="flex items-center gap-2 text-white/60 text-sm">
                <User className="w-4 h-4" />
                <span>Selected: {selectedClinician.full_name}</span>
                {selectedClinician.phone && (
                  <span className="ml-auto">{selectedClinician.phone}</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
