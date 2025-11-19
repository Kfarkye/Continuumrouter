import { useState, useCallback, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
// Import Trash2 for the remove button
import { X, Upload, FileText, CheckCircle, AlertCircle, Info, Loader2, ArrowRight, ArrowLeft, Download, Users, Briefcase, Trash2 } from 'lucide-react';
import Papa from 'papaparse';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabaseClient';

interface ClinicianImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

type ImportStep = 'upload' | 'preview' | 'importing' | 'complete';

// Base interface for the raw CSV data
interface ClinicianRecord {
  'Candidate Name': string;
  Email: string;
  Phone?: string;
  'Phone 2'?: string;
  Facility: string;
  'Start Date': string;
  'End Date': string;
  Recruiter: string;
  'Account Manager (AM)'?: string;
  'Assignment Coordinator (AC)'?: string;
  [key: string]: any;
}

// NEW: Define a type for records staged in the UI, including an internal ID for stable React keys
interface StagedClinicianRecord extends ClinicianRecord {
    _internalId: string;
}

interface ImportResults {
  successCount: number;
  failedCount: number;
  profilesCreated: number;
  assignmentsCreated: number;
  spacesCreated: number;
  notesCreated: number;
  errors: { row: number; message: string }[];
}

const EXPECTED_HEADERS = [
  'Candidate Name',
  'Email',
  'Phone (optional)',
  'Facility',
  'Start Date',
  'End Date',
  'Recruiter',
  'Account Manager (AM)',
  'Assignment Coordinator (AC)',
];

export function ClinicianImportModal({ isOpen, onClose, userId }: ClinicianImportModalProps) {
  const [step, setStep] = useState<ImportStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  // Updated type to StagedClinicianRecord
  const [parsedData, setParsedData] = useState<StagedClinicianRecord[]>([]);
  const [importResults, setImportResults] = useState<ImportResults | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [isParsing, setIsParsing] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Ensure the component is mounted on the client before rendering the portal (SSR Safety)
  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  // Handle body overflow lock when modal is open (UX Improvement)
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    // Cleanup function ensures scroll is re-enabled if the component unmounts
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);


  const resetState = useCallback(() => {
    setStep('upload');
    setFile(null);
    setParsedData([]);
    setImportResults(null);
    setImportProgress(0);
    setIsParsing(false);
  }, []);

  const handleClose = useCallback(() => {
    if (step === 'importing') {
      toast.error('Import is in progress. Please wait until it completes.');
      return;
    }
    onClose();
    setTimeout(resetState, 300);
  }, [step, onClose, resetState]);

  // NEW: Handler to remove a clinician during the preview step using the stable ID
  const handleRemoveClinician = useCallback((internalId: string) => {
    setParsedData(prevData => {
        const clinicianToRemove = prevData.find(item => item._internalId === internalId);
        const newData = prevData.filter(item => item._internalId !== internalId);

        if (clinicianToRemove) {
            toast.success(`Removed ${clinicianToRemove['Candidate Name']} from the import list.`);
        }
        return newData;
    });
  }, []);

  const parseDate = (dateStr: string): string | null => {
    try {
      const date = new Date(dateStr);
      return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
    } catch {
      return null;
    }
  };

  const getSystemPrompt = (clinicianName: string): string => {
    const firstName = clinicianName.split(' ')[0];
    return `You are Aya's AI assistant helping manage the career of healthcare traveler ${clinicianName}.

IMPORTANT: When the user mentions "${firstName}" they are referring to ${clinicianName}, the clinician you are helping manage.

CONTEXT PROVIDED (Dynamically Injected):
- Structured Profile data (name, email, phone)
- Current Assignment details (facility, dates, status)
- Golden Notes/Memories (important preferences and history)

YOUR ROLE:
1. Track assignment timelines proactively
2. Suggest personalized outreach based on end dates and Golden Notes
3. Draft communications that are warm, concise, and actionable
4. Answer questions about ${firstName}'s current situation and career

NAVIGATOR TIMELINE LOGIC:
- 6+ weeks before end: Suggest initiating "Extend or Explore?" conversation
- 4-6 weeks: Increase urgency "Secure decision soon"
- <4 weeks: CRITICAL "Urgent - finalize next steps to avoid gaps"

When asked about ${firstName}, provide relevant information about this clinician's profile, assignments, and career management.`;
  };


  const handleParse = useCallback(
    async (fileToParse: File) => {
      setIsParsing(true);
      try {
        // Parse using the base ClinicianRecord type first
        Papa.parse<ClinicianRecord>(fileToParse, {
          header: true,
          skipEmptyLines: true,
          transform: (v) => v.trim(),
          complete: (results) => {
            if (results.data.length === 0) {
              toast.error('The CSV file is empty.');
              setIsParsing(false);
              return;
            }

            // Transform ClinicianRecord to StagedClinicianRecord by adding unique IDs
            // Using a timestamp for the batch + the index ensures uniqueness for this session.
            const batchTimestamp = Date.now();
            const stagedData: StagedClinicianRecord[] = results.data.map((item, index) => ({
                ...item,
                _internalId: `${batchTimestamp}-${index}`,
            }));

            setParsedData(stagedData);
            setStep('preview');
            setIsParsing(false);
          },
          error: (error) => {
            console.error('Parsing Error:', error);
            toast.error(`Failed to parse CSV: ${error.message}`);
            setIsParsing(false);
          },
        });
      } catch (error) {
        console.error('Parsing Error:', error);
        toast.error(`Failed to parse CSV: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setIsParsing(false);
      }
    },
    []
  );

  // processClinician can accept StagedClinicianRecord as it extends ClinicianRecord
  const processClinician = async (
    clinician: ClinicianRecord,
    index: number
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data: profile, error: profileError } = await supabase
        .from('clinician_profiles')
        .upsert(
          {
            user_id: userId,
            full_name: clinician['Candidate Name'],
            email: clinician.Email,
            phone: clinician.Phone || null,
          },
          { onConflict: 'user_id,email' }
        )
        .select('id')
        .single();

      if (profileError) throw profileError;

      // CRITICAL: Verify profile data was returned (RLS can block .select() even after successful upsert)
      if (!profile || !profile.id) {
        throw new Error('Failed to retrieve clinician profile ID. Check RLS policies.');
      }

      const clinicianId = profile.id;

      const startDate = parseDate(clinician['Start Date']);
      const endDate = parseDate(clinician['End Date']);

      if (clinician.Facility && startDate && endDate) {
        const { error: assignmentError } = await supabase.from('assignments').insert({
          clinician_id: clinicianId,
          user_id: userId,
          facility_name: clinician.Facility,
          start_date: startDate,
          end_date: endDate,
          status: 'active',
        });

        // Ignore duplicate key errors (23505), but throw others
        if (assignmentError && assignmentError.code !== '23505') {
          throw assignmentError;
        }
      }

      let { data: space } = await supabase
        .from('projects')
        .select('id')
        .eq('user_id', userId)
        .eq('clinician_id', clinicianId)
        .maybeSingle();

      if (!space) {
        const { data: newSpace, error: spaceError } = await supabase
          .from('projects')
          .insert({
            user_id: userId,
            name: clinician['Candidate Name'],
            description: `Healthcare professional at ${clinician.Facility || 'various facilities'}`,
            clinician_id: clinicianId,
            system_prompt: getSystemPrompt(clinician['Candidate Name']),
          })
          .select('id')
          .single();

        if (spaceError) throw spaceError;

        // CRITICAL: Verify space data was returned (RLS can block .select() even after successful insert)
        if (!newSpace || !newSpace.id) {
          throw new Error('Failed to create project space. Check RLS policies.');
        }

        space = newSpace;
      }

      // FINAL CHECK: Ensure we have a valid space ID before creating memory
      if (!space || !space.id) {
        throw new Error('Space ID is missing. Cannot create memory note.');
      }

      const noteContent = `Imported from CSV. Recruiter: ${clinician.Recruiter || 'N/A'}. Team (AM/AC): ${
        clinician['Account Manager (AM)'] || ''
      } / ${clinician['Assignment Coordinator (AC)'] || ''}`;

      const { data: existingNote } = await supabase
        .from('memories')
        .select('id')
        .eq('clinician_id', clinicianId)
        .eq('content', noteContent)
        .maybeSingle();

      if (!existingNote) {
        await supabase.from('memories').insert({
          project_id: space.id,
          clinician_id: clinicianId,
          user_id: userId,
          kind: 'note',
          content: noteContent,
        });
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  };


  const startImport = useCallback(async () => {
    if (parsedData.length === 0) {
        toast.error("No data to import.");
        return;
    }

    setStep('importing');
    setImportProgress(0);

    const results: ImportResults = {
      successCount: 0,
      failedCount: 0,
      profilesCreated: 0,
      assignmentsCreated: 0,
      spacesCreated: 0,
      notesCreated: 0,
      errors: [],
    };

    try {
      const totalItems = parsedData.length;

      for (let i = 0; i < totalItems; i++) {
        const result = await processClinician(parsedData[i], i);

        if (result.success) {
          results.successCount++;
          // Assuming success means these were created or updated successfully
          results.profilesCreated++;
          results.assignmentsCreated++;
          results.spacesCreated++;
          results.notesCreated++;
        } else {
          results.failedCount++;
          results.errors.push({
            // Note: Row number refers to the index in the final batch being imported
            row: i + 1,
            message: result.error || 'Unknown error',
          });
        }

        setImportProgress(Math.round(((i + 1) / totalItems) * 100));
      }

      setImportResults(results);
      setStep('complete');
    } catch (error) {
      console.error('Import Error:', error);
      toast.error('An unexpected error occurred during the import process.');
      setStep('preview');
    }
  }, [parsedData, userId]);

  const getStepTitle = useMemo(() => {
    switch (step) {
      case 'upload':
        return 'Upload your CSV file to get started';
      case 'preview':
        return 'Review and confirm import details';
      case 'importing':
        return 'Processing your data. Please wait...';
      case 'complete':
        return 'Import process finished';
      default:
        return '';
    }
  }, [step]);

  // Only render if open AND mounted on the client
  if (!isOpen || !isMounted) return null;

  // Use createPortal to render the modal into document.body.
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={handleClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Modal Content - FULLY CENTERED */}
      <div
        className="relative bg-gradient-to-br from-zinc-950 to-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col z-10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between p-6 bg-zinc-900/50 border-b border-zinc-800 backdrop-blur-sm">
           <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center shadow-md shadow-blue-500/30">
              <Upload className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Import Clinicians</h2>
              <p className="text-sm text-zinc-400">{getStepTitle}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={step === 'importing'}
            className="text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors p-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Close modal"
          >
            <X className="w-6 h-6" />
          </button>
        </header>

        {/* Content Area - Scrollable */}
        <main className="flex-1 overflow-y-auto p-6">
          {step === 'upload' && (
            <UploadStep file={file} setFile={setFile} onContinue={handleParse} isParsing={isParsing} />
          )}

          {step === 'preview' && (
            <PreviewStep
                parsedData={parsedData}
                onBack={() => setStep('upload')}
                onStartImport={startImport}
                onRemoveClinician={handleRemoveClinician} // Pass the removal handler
            />
          )}

          {step === 'importing' && <ImportingStep progress={importProgress} total={parsedData.length} />}

          {step === 'complete' && importResults && (
            <CompleteStep results={importResults} onClose={handleClose} onImportAnother={resetState} />
          )}
        </main>
      </div>
    </div>,
    document.body
  );
}

// --- Step Components ---

const UploadStep = ({
  file,
  setFile,
  onContinue,
  isParsing,
}: {
  file: File | null;
  setFile: (file: File | null) => void;
  onContinue: (file: File) => void;
  isParsing: boolean;
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = (selectedFile: File) => {
    if (selectedFile && (selectedFile.type === 'text/csv' || selectedFile.name.endsWith('.csv'))) {
      setFile(selectedFile);
    } else {
      toast.error('Invalid file type. Please upload a CSV file.');
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Drop Zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer ${
          isDragging ? 'border-blue-500 bg-blue-500/10' : 'border-zinc-700 hover:border-zinc-600'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => document.getElementById('csv-upload')?.click()}
      >
        <Upload className={`w-16 h-16 mx-auto mb-4 ${isDragging ? 'text-blue-400' : 'text-zinc-600'}`} />
        <h3 className="text-xl font-semibold text-white mb-2">Drag & Drop CSV file here</h3>
        <p className="text-zinc-400 mb-4">or click to browse your files</p>
        <input
          id="csv-upload"
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const uploadedFile = e.target.files?.[0];
            if (uploadedFile) handleFileSelect(uploadedFile);
          }}
        />
        {file && (
          <div className="mt-4 inline-flex items-center gap-3 px-4 py-2 bg-green-900/50 border border-green-700 rounded-lg shadow-sm">
            <FileText className="w-5 h-5 text-green-400" />
            <span className="text-green-400 font-medium">{file.name}</span>
            <span className="text-zinc-500 text-sm">({(file.size / 1024).toFixed(1)} KB)</span>
            <button
              className="ml-2 h-6 w-6 text-green-600 hover:text-green-400"
              onClick={(e) => {
                e.stopPropagation();
                setFile(null);
              }}
              aria-label="Remove file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Expected Format Info */}
      <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
        <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Info className="w-5 h-5 text-blue-500" />
          Required CSV Format
        </h4>
        <p className="text-sm text-zinc-400 mb-4">
          Ensure your CSV includes the following columns. Headers must match exactly.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
          {EXPECTED_HEADERS.map((header) => (
            <div key={header} className="bg-zinc-800/70 p-2 rounded text-zinc-300 truncate" title={header}>
              {header}
            </div>
          ))}
        </div>
        <button
          className="text-blue-400 hover:text-blue-300 text-sm mt-4 flex items-center gap-2"
          onClick={() => toast('Download template feature coming soon')}
        >
          <Download className="w-4 h-4" /> Download Template
        </button>
      </div>

      {/* Continue Button */}
      <button
        onClick={() => {
          if (file) {
            onContinue(file);
          }
        }}
        disabled={!file || isParsing}
        className="w-full py-6 text-lg bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all shadow-md disabled:shadow-none flex items-center justify-center gap-2"
      >
        {isParsing ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Parsing CSV...
          </>
        ) : (
          <>
            Validate and Preview
            <ArrowRight className="w-5 h-5" />
          </>
        )}
      </button>
    </div>
  );
};


// UPDATED: PreviewStep to include removal functionality
const PreviewStep = ({
  parsedData,
  onBack,
  onStartImport,
  onRemoveClinician,
}: {
  parsedData: StagedClinicianRecord[]; // Updated type
  onBack: () => void;
  onStartImport: () => void;
  onRemoveClinician: (internalId: string) => void;
}) => {
  const stats = useMemo(
    () => ({
      totalRows: parsedData.length,
      uniqueClinicians: new Set(parsedData.map((r) => r.Email)).size,
      assignments: parsedData.filter((r) => r.Facility && r['Start Date']).length,
    }),
    [parsedData] // Stats recalculate whenever parsedData changes
  );

  // Handle the case where the user removes all rows
  if (stats.totalRows === 0) {
    return (
        <div className="space-y-6 text-center py-12">
            <Info className="w-16 h-16 text-yellow-600 mx-auto" />
            <h3 className="text-2xl font-bold text-white mt-4">No Records Remaining</h3>
            <p className="text-zinc-400">You have removed all records from the import list.</p>
            <button
                onClick={onBack}
                className="mt-6 py-3 px-6 text-lg bg-zinc-700 hover:bg-zinc-600 text-white font-semibold rounded-lg transition-all flex items-center justify-center gap-2 mx-auto"
            >
                <ArrowLeft className="w-5 h-5" />
                Back to Upload
            </button>
        </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Preview Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard title="Rows to Import" value={stats.totalRows} />
        <StatCard title="Unique Clinicians" value={stats.uniqueClinicians} />
        <StatCard title="Valid Assignments" value={stats.assignments} />
      </div>

      {/* Data Preview Table - Now showing all data */}
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
        <h4 className="text-lg font-semibold text-white p-4 border-b border-zinc-800">
            Review Data ({stats.totalRows} Rows)
        </h4>
        {/* Increased max height and made scrollable */}
        <div className="overflow-x-auto max-h-[60vh]">
          <table className="w-full text-sm">
            <thead className="bg-zinc-800/50 sticky top-0">
              <tr className="text-left text-zinc-400">
                {/* New Actions Column */}
                <th className="p-3 font-medium w-16">Actions</th>
                <th className="p-3 font-medium">Name</th>
                <th className="p-3 font-medium">Email</th>
                <th className="p-3 font-medium">Facility</th>
                <th className="p-3 font-medium">Start Date</th>
                <th className="p-3 font-medium">End Date</th>
                <th className="p-3 font-medium">Recruiter</th>
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              {/* Iterate over all data, using the stable _internalId as the key */}
              {parsedData.map((row) => (
                <tr key={row._internalId} className="border-b border-zinc-800 last:border-b-0 hover:bg-zinc-800/30 transition-colors">
                    {/* Remove Button */}
                    <td className="p-3">
                        <button
                            onClick={() => onRemoveClinician(row._internalId)}
                            className="text-zinc-500 hover:text-red-500 transition-colors p-1 rounded-md hover:bg-red-500/10"
                            title="Remove this record from import"
                            aria-label={`Remove ${row['Candidate Name']}`}
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </td>
                    <td className="p-3 truncate max-w-xs">{row['Candidate Name']}</td>
                    <td className="p-3 truncate max-w-xs">{row.Email}</td>
                    <td className="p-3 truncate max-w-xs">{row.Facility}</td>
                    <td className="p-3">{row['Start Date']}</td>
                    <td className="p-3">{row['End Date']}</td>
                    <td className="p-3 truncate max-w-xs">{row.Recruiter}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Warning/Info Box */}
      <div className="flex items-center gap-3 p-4 bg-blue-900/30 border border-blue-700 text-blue-400 rounded-lg">
        <Info className="w-5 h-5 flex-shrink-0" />
        <p className="text-sm">
          Please confirm the data format. Use the trash icon to remove unwanted entries. Existing clinicians will be updated, new ones will be created.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4 pt-4">
        <button
          onClick={onBack}
          className="flex-1 py-6 text-lg bg-zinc-700 hover:bg-zinc-600 text-white font-semibold rounded-lg transition-all flex items-center justify-center gap-2"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Upload
        </button>
        <button
          onClick={onStartImport}
          disabled={stats.totalRows === 0}
          className="flex-1 py-6 text-lg bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 text-white font-semibold rounded-lg transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Start Import ({stats.totalRows} records)
        </button>
      </div>
    </div>
  );
};

const ImportingStep = ({ progress, total }: { progress: number; total: number }) => {
  const processedCount = Math.round((progress / 100) * total);
  return (
    <div className="flex flex-col items-center justify-center h-full py-20">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-center mb-8">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin mr-4" />
          <h3 className="text-2xl font-bold text-white">Importing Data...</h3>
        </div>

        <div className="flex justify-between items-center mb-3">
          <p className="text-sm text-zinc-400">
            Processing record {processedCount} of {total}
          </p>
          <p className="text-lg font-bold text-blue-400">{progress}%</p>
        </div>

        {/* Progress Bar */}
        <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <p className="text-zinc-400 mt-6 text-center">Please do not close this window or navigate away.</p>
      </div>
    </div>
  );
};

const CompleteStep = ({
  results,
  onClose,
  onImportAnother,
}: {
  results: ImportResults;
  onClose: () => void;
  onImportAnother: () => void;
}) => {
  const isSuccess = results.failedCount === 0;

  return (
    <div className="space-y-6">
      {/* Success/Partial Success Header */}
      <div className="text-center py-6">
        {isSuccess ? (
          <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-4" />
        ) : (
          <AlertCircle className="w-20 h-20 text-yellow-500 mx-auto mb-4" />
        )}
        <h3 className="text-3xl font-bold text-white mb-3">
          {isSuccess ? 'Import Successful!' : 'Import Partially Complete'}
        </h3>
        <p className="text-lg text-zinc-400">
          Successfully processed {results.successCount} records.
          {results.failedCount > 0 && ` ${results.failedCount} records failed to import.`}
        </p>
      </div>

      {/* Detailed Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Profiles Created" value={results.profilesCreated} />
        <StatCard title="Assignments Added" value={results.assignmentsCreated} />
        <StatCard title="Spaces Created" value={results.spacesCreated} />
        <StatCard title="Records Failed" value={results.failedCount} highlight={results.failedCount > 0} />
      </div>

      {/* Errors List if any */}
      {results.errors?.length > 0 && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
          <h4 className="text-lg font-semibold text-red-400 mb-3 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Details on Failed Imports
          </h4>
          <div className="space-y-2 text-sm text-red-300 max-h-40 overflow-y-auto pr-2">
            {results.errors.slice(0, 20).map((error, idx) => (
              <div key={idx} className="bg-red-900/20 p-2 rounded">
                {/* Clarify that the row number refers to the batch index */}
                <strong>Batch Row {error.row}:</strong> {error.message}
              </div>
            ))}
          </div>
          {results.failedCount > results.errors.length && (
            <p className="text-sm text-red-400 mt-3">...and {results.failedCount - results.errors.length} other errors.</p>
          )}
          <button
            className="text-red-400 hover:text-red-300 text-sm mt-4 flex items-center gap-2"
            onClick={() => toast('Download error report feature coming soon')}
          >
            <Download className="w-4 h-4" /> Download Error Report
          </button>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-4 pt-4">
        <button
          onClick={onImportAnother}
          className="flex-1 py-6 text-lg bg-zinc-700 hover:bg-zinc-600 text-white font-semibold rounded-lg transition-all"
        >
          Import Another File
        </button>
        <button
          onClick={onClose}
          className="flex-1 py-6 text-lg bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-semibold rounded-lg transition-all shadow-md"
        >
          Finish
        </button>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, highlight = false }: { title: string; value: number; highlight?: boolean }) => (
  <div
    className={`bg-zinc-900 rounded-lg p-5 border text-center shadow-md ${highlight ? 'border-red-700' : 'border-zinc-800'}`}
  >
    <div className={`text-4xl font-bold mb-2 ${highlight ? 'text-red-500' : 'text-white'}`}>
      {value.toLocaleString()}
    </div>
    <div className="text-sm text-zinc-400">{title}</div>
  </div>
);