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
      <div className="flex items-center justify-center h-full bg-gray-900">
        <div className="w-4 h-4 bg-blue-500 rounded-full animate-pulse" />
      </div>
    );
  }

  if (clinicians.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-900">
        <p className="text-gray-500 text-sm font-medium">
          No clinicians available
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#262626]">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto px-6 py-16 space-y-12">
          {/* Header */}
          <div className="space-y-4">
            <h1 className="text-3xl font-semibold text-white">
              Reply Assistant
            </h1>
            <p className="text-gray-400 text-sm">
              Intelligent responses, tailored just for you
            </p>
          </div>

          {/* Input Section */}
          <div className="space-y-8">
            {/* Clinician Selection */}
            <div className="space-y-3">
              <label className="block text-sm text-gray-400 tracking-wide">
                Clinician
              </label>
              <select
                value={selectedClinicianId}
                onChange={(e) => setSelectedClinicianId(e.target.value)}
                className="w-full px-4 py-3 bg-[#333333] border border-gray-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition ease-in-out"
              >
                {clinicians.map(clinician => (
                  <option key={clinician.id} value={clinician.id} className="bg-[#333333]">
                    {clinician.full_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Incoming Message */}
            <div className="space-y-3">
              <label className="block text-sm text-gray-400 tracking-wide">
                Incoming Message
              </label>
              <textarea
                value={incomingText}
                onChange={(e) => setIncomingText(e.target.value)}
                placeholder="Enter the message..."
                rows={6}
                className="w-full px-4 py-3 bg-[#333333] border border-gray-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition ease-in-out resize-none"
              />
            </div>

            {/* User Goal */}
            <div className="space-y-3">
              <label className="block text-sm text-gray-400 tracking-wide">
                Goal <span className="text-gray-500">(Optional)</span>
              </label>
              <input
                type="text"
                value={userGoal}
                onChange={(e) => setUserGoal(e.target.value)}
                placeholder="What would you like to achieve?"
                className="w-full px-4 py-3 bg-[#333333] border border-gray-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition ease-in-out"
              />
            </div>

            {/* Generate Button */}
            <div>
              <button
                onClick={handleGenerateReply}
                disabled={isGenerating || !incomingText.trim()}
                className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-medium rounded-lg transition-all duration-150 disabled:cursor-not-allowed"
              >
                {isGenerating ? 'Generating...' : 'Generate Replies'}
              </button>
            </div>
          </div>

          {/* Generated Replies */}
          {generatedReplies && (
            <div className="space-y-8 pt-8">
              {[generatedReplies.reply_1, generatedReplies.reply_2].map((reply, index) => (
                <div
                  key={index}
                  className="space-y-4 p-4 border border-gray-700 rounded-lg"
                >
                  <div className="text-sm text-gray-400 tracking-wide">
                    Option {index + 1}
                  </div>
                  <p className="text-white whitespace-pre-wrap">
                    {reply}
                  </p>

                  <div className="flex gap-4">
                    <button
                      onClick={() => handleCopyReply(reply, index)}
                      className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-all duration-150"
                    >
                      {copiedIndex === index ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      onClick={() => handleSelectReply(reply, index)}
                      className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all duration-150"
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
            <div className="pt-8">
              <div className="flex justify-between text-sm text-gray-500">
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