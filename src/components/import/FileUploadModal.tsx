import React, { useState, useRef } from 'react';
import { X, UploadCloud, FileText, CheckCircle2, AlertCircle, AlertTriangle, Files, Check } from 'lucide-react';
import { useStatements, BatchImportSummary } from '../../context/StatementContext';

interface FileUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FileUploadModal: React.FC<FileUploadModalProps> = ({ isOpen, onClose }) => {
  const { handleBatchFileUpload } = useStatements();
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressStatus, setProgressStatus] = useState<string>('');
  const [batchSummary, setBatchSummary] = useState<BatchImportSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const processFiles = async (fileList: File[]) => {
    if (fileList.length === 0) return;

    setIsProcessing(true);
    setBatchSummary(null);
    setProgressStatus(`Preparing to process ${fileList.length} file${fileList.length > 1 ? 's' : ''}...`);

    try {
      const summary = await handleBatchFileUpload(fileList, (current, total, fileName) => {
        setProgressStatus(`Processing file ${current} of ${total}: "${fileName}"...`);
      });

      setBatchSummary(summary);
      setProgressStatus('');
    } catch (err: any) {
      setProgressStatus(`Error during batch processing: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(Array.from(e.target.files));
    }
  };

  const handleResetModal = () => {
    setBatchSummary(null);
    setProgressStatus('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Files size={22} color="var(--brand-primary)" />
            <h2 className="modal-title">Import Statements (Single or Multiple)</h2>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
          Select or drag-and-drop <strong>one or multiple statement files at the same time</strong> (PDF, CSV, OFX, or QFX).
          All parsing, duplicate hashing, and ledger reconciliation happen <strong>100% locally in your browser</strong>.
        </p>

        {/* Drag and Drop Zone */}
        <div
          className={`dropzone ${isDragging ? 'active' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".csv,.pdf,.ofx,.qfx,.txt"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <UploadCloud className="dropzone-icon" />
          <div style={{ fontWeight: 600, fontSize: '1.05rem', marginBottom: '0.35rem' }}>
            {isProcessing ? progressStatus : 'Choose multiple files or drag & drop them here'}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            You can drop 5, 10, or 20+ statements at once. Supports PDF, CSV, and OFX/QFX formats.
          </div>
        </div>

        {/* Live Processing Spinner */}
        {isProcessing && (
          <div
            style={{
              marginTop: '1.25rem',
              padding: '1rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-surface-raised)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              fontSize: '0.875rem',
              color: 'var(--brand-primary)'
            }}
          >
            <div
              style={{
                width: '18px',
                height: '18px',
                border: '2px solid var(--brand-primary)',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }}
            />
            <span>{progressStatus}</span>
          </div>
        )}

        {/* Batch Import Summary Report */}
        {batchSummary && (
          <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Top Stat Pills */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '0.5rem',
                fontSize: '0.8rem',
                textAlign: 'center'
              }}
            >
              <div
                style={{
                  background: 'var(--success-bg)',
                  border: '1px solid var(--success-border)',
                  color: 'var(--success)',
                  padding: '0.5rem',
                  borderRadius: 'var(--radius-sm)'
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{batchSummary.successCount}</div>
                <div>Imported ({batchSummary.totalTransactionsInserted} txs)</div>
              </div>

              <div
                style={{
                  background: 'var(--warning-bg)',
                  border: '1px solid var(--warning-border)',
                  color: 'var(--warning)',
                  padding: '0.5rem',
                  borderRadius: 'var(--radius-sm)'
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{batchSummary.duplicateCount}</div>
                <div>Duplicates Skipped</div>
              </div>

              <div
                style={{
                  background: batchSummary.errorCount > 0 ? 'var(--danger-bg)' : 'var(--bg-surface-raised)',
                  border: `1px solid ${batchSummary.errorCount > 0 ? 'var(--danger-border)' : 'var(--border-subtle)'}`,
                  color: batchSummary.errorCount > 0 ? 'var(--danger)' : 'var(--text-muted)',
                  padding: '0.5rem',
                  borderRadius: 'var(--radius-sm)'
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{batchSummary.errorCount}</div>
                <div>Failed / Invalid</div>
              </div>
            </div>

            {/* Itemized File Results */}
            <div
              style={{
                maxHeight: '180px',
                overflowY: 'auto',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-surface-raised)'
              }}
            >
              {batchSummary.fileResults.map((r, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '0.5rem 0.75rem',
                    borderBottom: idx < batchSummary.fileResults.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.8rem',
                    gap: '0.5rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                    {r.status === 'SUCCESS' ? (
                      <CheckCircle2 size={15} color="var(--success)" style={{ flexShrink: 0 }} />
                    ) : r.status === 'DUPLICATE' ? (
                      <AlertTriangle size={15} color="var(--warning)" style={{ flexShrink: 0 }} />
                    ) : (
                      <AlertCircle size={15} color="var(--danger)" style={{ flexShrink: 0 }} />
                    )}
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.fileName}
                    </span>
                  </div>

                  <span
                    style={{
                      fontSize: '0.75rem',
                      color:
                        r.status === 'SUCCESS'
                          ? 'var(--success)'
                          : r.status === 'DUPLICATE'
                          ? 'var(--warning)'
                          : 'var(--danger)',
                      flexShrink: 0
                    }}
                  >
                    {r.status === 'SUCCESS'
                      ? `+${r.transactionsCount} txs`
                      : r.status === 'DUPLICATE'
                      ? 'Duplicate'
                      : 'Error'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div
          style={{
            marginTop: '1.5rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.75rem',
            color: 'var(--text-muted)'
          }}
        >
          <span>SHA-256 Conflict & Duplicate Guard Active</span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {batchSummary && (
              <button className="btn btn-secondary btn-sm" onClick={handleResetModal}>
                Import More Files
              </button>
            )}
            <button className="btn btn-primary btn-sm" onClick={onClose}>
              {batchSummary ? 'Done' : 'Cancel'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
