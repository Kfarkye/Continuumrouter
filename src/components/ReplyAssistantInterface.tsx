import React, { useState, useEffect } from 'react';
import { useReplyAssistant } from '../hooks/useReplyAssistant';
import { Sparkles } from 'lucide-react';
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
    toast.success('Reply selected');

    setIncomingText('');
    setUserGoal('');
    setGeneratedReplies(null);
  };

  const handleCopyReply = async (reply: string, index: number) => {
    await navigator.clipboard.writeText(reply);
    setCopiedIndex(index);
    toast.success('Copied');
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-black">
        <div className="w-1 h-1 bg-white rounded-full animate-pulse" />
      </div>
    );
  }

  if (clinicians.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-black">
        <p className="text-white/40 text-sm font-light tracking-wide">
          No clinicians available
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-black">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-16 space-y-12">
          {/* Header */}
          <div className="space-y-2">
            <h1 className="text-4xl font-light tracking-tight text-white">
              Reply Assistant
            </h1>
            <p className="text-white/40 font-light tracking-wide text-sm">
              Intelligent responses, crafted for you
            </p>
          </div>

          {/* Input Section */}
          <div className="space-y-8">
            {/* Clinician Selection */}
            <div className="space-y-3">
              <label className="block text-xs font-medium text-white/60 uppercase tracking-wider">
                Clinician
              </label>
              <select
                value={selectedClinicianId}
                onChange={(e) => setSelectedClinicianId(e.target.value)}
                className="w-full px-0 py-4 bg-transparent border-0 border-b border-white/10 text-white text-base font-light focus:outline-none focus:border-white/40 transition-colors appearance-none cursor-pointer"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23ffffff' stroke-opacity='0.3' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 0 center',
                }}
              >
                {clinicians.map(clinician => (
                  <option key={clinician.id} value={clinician.id} className="bg-zinc-900">
                    {clinician.full_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Incoming Message */}
            <div className="space-y-3">
              <label className="block text-xs font-medium text-white/60 uppercase tracking-wider">
                Incoming Message
              </label>
              <textarea
                value={incomingText}
                onChange={(e) => setIncomingText(e.target.value)}
                placeholder="Enter the message..."
                rows={6}
                className="w-full px-0 py-4 bg-transparent border-0 border-b border-white/10 text-white text-base font-light placeholder-white/20 focus:outline-none focus:border-white/40 transition-colors resize-none"
              />
            </div>

            {/* User Goal */}
            <div className="space-y-3">
              <label className="block text-xs font-medium text-white/60 uppercase tracking-wider">
                Goal <span className="text-white/30">(Optional)</span>
              </label>
              <input
                type="text"
                value={userGoal}
                onChange={(e) => setUserGoal(e.target.value)}
                placeholder="What would you like to achieve?"
                className="w-full px-0 py-4 bg-transparent border-0 border-b border-white/10 text-white text-base font-light placeholder-white/20 focus:outline-none focus:border-white/40 transition-colors"
              />
            </div>

            {/* Generate Button */}
            <div className="pt-4">
              <button
                onClick={handleGenerateReply}
                disabled={isGenerating || !incomingText.trim()}
                className="w-full px-8 py-5 bg-white hover:bg-white/90 disabled:bg-white/30 text-black text-sm font-medium tracking-wide rounded-2xl transition-all duration-200 disabled:cursor-not-allowed"
              >
                {isGenerating ? 'Generating...' : 'Generate Replies'}
              </button>
            </div>
          </div>

          {/* Generated Replies */}
          {generatedReplies && (
            <div className="space-y-8 pt-8 border-t border-white/5">
              {[generatedReplies.reply_1, generatedReplies.reply_2].map((reply, index) => (
                <div
                  key={index}
                  className="space-y-6 pb-8 border-b border-white/5 last:border-0"
                >
                  <div className="space-y-4">
                    <div className="text-xs font-medium text-white/40 uppercase tracking-wider">
                      Option {index + 1}
                    </div>
                    <p className="text-base font-light text-white/90 leading-relaxed whitespace-pre-wrap">
                      {reply}
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => handleCopyReply(reply, index)}
                      className="flex-1 px-6 py-4 bg-white/5 hover:bg-white/10 text-white text-sm font-medium tracking-wide rounded-xl transition-all duration-200"
                    >
                      {copiedIndex === index ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      onClick={() => handleSelectReply(reply, index)}
                      className="flex-1 px-6 py-4 bg-white hover:bg-white/90 text-black text-sm font-medium tracking-wide rounded-xl transition-all duration-200"
                    >
                      Use Reply
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Selected Clinician Info */}
          {selectedClinician && !generatedReplies && (
            <div className="pt-8 border-t border-white/5">
              <div className="flex items-baseline justify-between text-xs text-white/30 font-light tracking-wide">
                <span>{selectedClinician.full_name}</span>
                {selectedClinician.email && (
                  <span>{selectedClinician.email}</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}