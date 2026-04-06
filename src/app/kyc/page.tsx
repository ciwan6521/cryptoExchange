'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Upload,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Camera,
  CreditCard,
  FileText,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { kycApi } from '@/lib/api';

type DocSlot = {
  file: File | null;
  preview: string | null;
  uploading: boolean;
  uploaded: boolean;
  error: string | null;
  serverStatus: string | null;
};

const initialSlot: DocSlot = {
  file: null,
  preview: null,
  uploading: false,
  uploaded: false,
  error: null,
  serverStatus: null,
};

export default function KYCPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const restoreSession = useAuthStore((s) => s.restoreSession);

  const [idFront, setIdFront] = useState<DocSlot>({ ...initialSlot });
  const [idBack, setIdBack] = useState<DocSlot>({ ...initialSlot });
  const [proofAddr, setProofAddr] = useState<DocSlot>({ ...initialSlot });
  const [kycStatus, setKycStatus] = useState<string>('none');
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);
  const proofRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user?.kycStatus === 'approved') {
      router.replace('/dashboard');
      return;
    }

    const fetchStatus = async () => {
      try {
        const data = await kycApi.getStatus();
        setKycStatus(data.kyc_status);

        for (const doc of data.documents) {
          const slot: Partial<DocSlot> = {
            uploaded: true,
            serverStatus: doc.status,
          };
          if (doc.document_type === 'id_front') {
            setIdFront(prev => ({ ...prev, ...slot }));
          } else if (doc.document_type === 'id_back') {
            setIdBack(prev => ({ ...prev, ...slot }));
          } else if (doc.document_type === 'proof_of_address') {
            setProofAddr(prev => ({ ...prev, ...slot }));
          }
          if (doc.rejection_reason) setRejectionReason(doc.rejection_reason);
        }
      } catch {
        // first time — no docs yet
      } finally {
        setLoading(false);
      }
    };
    fetchStatus();
  }, [user, router]);

  const slotSetters: Record<string, React.Dispatch<React.SetStateAction<DocSlot>>> = {
    id_front: setIdFront,
    id_back: setIdBack,
    proof_of_address: setProofAddr,
  };

  const handleFileSelect = useCallback(
    (type: 'id_front' | 'id_back' | 'proof_of_address') => (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const setter = slotSetters[type];

      if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
        setter(prev => ({ ...prev, error: 'Only JPEG/PNG images are accepted' }));
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setter(prev => ({ ...prev, error: 'File size must be less than 5 MB' }));
        return;
      }

      const preview = URL.createObjectURL(file);
      setter({ file, preview, uploading: false, uploaded: false, error: null, serverStatus: null });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const handleDrop = useCallback(
    (type: 'id_front' | 'id_back' | 'proof_of_address') => (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (!file) return;

      const fakeEvent = {
        target: { files: [file] },
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileSelect(type)(fakeEvent);
    },
    [handleFileSelect]
  );

  const handleSubmit = async () => {
    if (!idFront.file && !idFront.uploaded) {
      setIdFront(prev => ({ ...prev, error: 'Please upload the front of your ID' }));
      return;
    }
    if (!idBack.file && !idBack.uploaded) {
      setIdBack(prev => ({ ...prev, error: 'Please upload the back of your ID' }));
      return;
    }
    if (!proofAddr.file && !proofAddr.uploaded) {
      setProofAddr(prev => ({ ...prev, error: 'Please upload a proof of address document' }));
      return;
    }

    setSubmitting(true);

    const uploads: { type: string; slot: DocSlot; setter: React.Dispatch<React.SetStateAction<DocSlot>> }[] = [
      { type: 'id_front', slot: idFront, setter: setIdFront },
      { type: 'id_back', slot: idBack, setter: setIdBack },
      { type: 'proof_of_address', slot: proofAddr, setter: setProofAddr },
    ];

    try {
      for (const { type, slot, setter } of uploads) {
        if (slot.file) {
          setter(prev => ({ ...prev, uploading: true, error: null }));
          await kycApi.upload(type, slot.file);
          setter(prev => ({ ...prev, uploading: false, uploaded: true, serverStatus: 'pending' }));
        }
      }

      setKycStatus('pending');
      await restoreSession();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      const failedUpload = uploads.find(u => u.slot.file && !u.slot.uploaded);
      if (failedUpload) failedUpload.setter(prev => ({ ...prev, uploading: false, error: msg }));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  if (kycStatus === 'pending') {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center"
        >
          <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-6">
            <Clock className="w-8 h-8 text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">Verification Pending</h1>
          <p className="text-gray-400 mb-8 leading-relaxed">
            Your identity documents have been submitted successfully. Our team will review them within 24 hours.
            You will be notified once the verification is complete.
          </p>
          <Button onClick={() => router.push('/dashboard')} size="lg" fullWidth>
            Go to Dashboard
          </Button>
        </motion.div>
      </div>
    );
  }

  const isRejected = kycStatus === 'rejected';

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-lg w-full"
      >
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center mb-6">
            <Image
              src="/Crypto4pro.png"
              alt="Crypto4Pro Logo"
              width={160}
              height={45}
              className="object-contain"
              style={{ width: 'auto', height: '36px' }}
              priority
            />
          </Link>
          <h1 className="text-2xl font-bold text-white mb-2">Identity Verification</h1>
          <p className="text-gray-400">
            Upload your government-issued ID and a proof of address document
          </p>
        </div>

        {isRejected && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-400 mb-1">Verification Rejected</p>
              <p className="text-xs text-gray-400">
                {rejectionReason || 'Your documents were not accepted. Please upload clear, valid photos and try again.'}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <UploadSlot
            label="ID Card — Front"
            description="Upload a clear photo of the front of your ID"
            icon={<CreditCard className="w-6 h-6" />}
            slot={idFront}
            inputRef={frontRef}
            onFileSelect={handleFileSelect('id_front')}
            onDrop={handleDrop('id_front')}
            onClickUpload={() => frontRef.current?.click()}
          />

          <UploadSlot
            label="ID Card — Back"
            description="Upload a clear photo of the back of your ID"
            icon={<CreditCard className="w-6 h-6 rotate-180" />}
            slot={idBack}
            inputRef={backRef}
            onFileSelect={handleFileSelect('id_back')}
            onDrop={handleDrop('id_back')}
            onClickUpload={() => backRef.current?.click()}
          />

          <UploadSlot
            label="Proof of Address"
            description="Utility bill, bank statement or residence certificate"
            icon={<FileText className="w-6 h-6" />}
            slot={proofAddr}
            inputRef={proofRef}
            onFileSelect={handleFileSelect('proof_of_address')}
            onDrop={handleDrop('proof_of_address')}
            onClickUpload={() => proofRef.current?.click()}
          />
        </div>

        <div className="mt-8">
          <Button
            onClick={handleSubmit}
            fullWidth
            size="lg"
            loading={submitting}
            disabled={submitting}
            icon={<ArrowRight className="w-5 h-5" />}
            iconPosition="right"
          >
            {isRejected ? 'Resubmit Documents' : 'Submit for Verification'}
          </Button>
        </div>

        <p className="mt-6 text-center text-xs text-gray-600 leading-relaxed">
          Your documents are encrypted and securely stored. They are only used for identity verification
          and will not be shared with third parties.
        </p>
      </motion.div>
    </div>
  );
}

function UploadSlot({
  label,
  description,
  icon,
  slot,
  inputRef,
  onFileSelect,
  onDrop,
  onClickUpload,
}: {
  label: string;
  description: string;
  icon: React.ReactNode;
  slot: DocSlot;
  inputRef: React.RefObject<HTMLInputElement>;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: React.DragEvent) => void;
  onClickUpload: () => void;
}) {
  const statusIcon = slot.serverStatus === 'approved' ? (
    <CheckCircle2 className="w-4 h-4 text-green-400" />
  ) : slot.serverStatus === 'rejected' ? (
    <XCircle className="w-4 h-4 text-red-400" />
  ) : slot.serverStatus === 'pending' ? (
    <Clock className="w-4 h-4 text-amber-400" />
  ) : null;

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className={cn(
        'rounded-xl border-2 border-dashed p-5 transition-all cursor-pointer hover:border-brand-500/40',
        slot.error ? 'border-red-500/40 bg-red-500/[0.03]' : 'border-glass-border bg-white/[0.02]',
        slot.preview && 'border-solid',
      )}
      onClick={onClickUpload}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/jpg"
        className="hidden"
        onChange={onFileSelect}
      />

      {slot.preview ? (
        <div className="flex items-center gap-4">
          <div className="w-20 h-14 rounded-lg overflow-hidden bg-black/30 flex-shrink-0">
            <img src={slot.preview} alt={label} className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-sm font-semibold text-white truncate">{label}</p>
              {statusIcon}
            </div>
            <p className="text-xs text-gray-500 truncate">{slot.file?.name || 'Uploaded'}</p>
            {slot.uploading && (
              <div className="flex items-center gap-1.5 mt-1">
                <Loader2 className="w-3 h-3 text-brand-400 animate-spin" />
                <span className="text-[10px] text-brand-400">Uploading...</span>
              </div>
            )}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onClickUpload(); }}
            className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      ) : slot.uploaded && !slot.file ? (
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-brand-500/10 flex items-center justify-center flex-shrink-0">
            {icon}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-sm font-semibold text-white">{label}</p>
              {statusIcon}
            </div>
            <p className="text-xs text-gray-500">Previously uploaded — click to replace</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/[0.04] flex items-center justify-center flex-shrink-0">
            <Upload className="w-5 h-5 text-gray-500" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-white mb-0.5">{label}</p>
            <p className="text-xs text-gray-500">{description}</p>
            <p className="text-[10px] text-gray-600 mt-1">JPEG or PNG, max 5 MB</p>
          </div>
          <Camera className="w-5 h-5 text-gray-600 flex-shrink-0" />
        </div>
      )}

      {slot.error && (
        <p className="text-xs text-red-400 mt-2">{slot.error}</p>
      )}
    </div>
  );
}
