import React, { useState } from 'react';
import { Upload, Calendar, RefreshCw, FileText, Trash2, AlertTriangle } from 'lucide-react';
import { useStatements } from '../../context/StatementContext';

interface TopbarProps {
  onOpenUpload: () => void;
  onOpenAddExpense?: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({ onOpenUpload, onOpenAddExpense }) => {
  const {
    statements,
    availableYears,
    availableMonths,
    selectedStatementId,
    setSelectedStatementId,
    activeStatement,
    deleteStatement,
    refreshData,
    isLoading
  } = useStatements();

  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const handleDeleteActiveStatement = async () => {
    if (
      !activeStatement ||
      selectedStatementId.startsWith('MONTH:') ||
      selectedStatementId.startsWith('YEAR:') ||
      selectedStatementId === 'ALL'
    )
      return;
    setIsDeleting(true);
    try {
      await deleteStatement(activeStatement.id);
      setConfirmDelete(false);
    } catch (err) {
      console.error('Failed to delete statement:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const isIndividualFileSelected =
    activeStatement &&
    !selectedStatementId.startsWith('MONTH:') &&
    !selectedStatementId.startsWith('YEAR:') &&
    selectedStatementId !== 'ALL';

  return (
    <header className="topbar">
      <div className="topbar-title-group">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <select
            className="select-control"
            value={selectedStatementId}
            onChange={(e) => setSelectedStatementId(e.target.value)}
            style={{ maxWidth: '420px', fontWeight: 600 }}
          >
            <option value="ALL">All Statements Combined (Overall Total)</option>

            {availableYears.length > 0 && (
              <optgroup label="🗓️ Full Year Totals (All Cards Combined)">
                {availableYears.map((year) => (
                  <option key={`YEAR:${year}`} value={`YEAR:${year}`}>
                    {year} Full Year Total (All Cards Combined)
                  </option>
                ))}
              </optgroup>
            )}

            {availableYears.map((year) => {
              const monthsInYear = availableMonths.filter((m) => m.year === year);
              if (monthsInYear.length === 0) return null;
              return (
                <optgroup key={year} label={`📅 ${year} Calendar Months (All Cards Combined)`}>
                  {monthsInYear.map((m) => (
                    <option key={m.monthKey} value={`MONTH:${m.monthKey}`}>
                      {m.monthLabel} (All Cards Combined)
                    </option>
                  ))}
                </optgroup>
              );
            })}

            {statements.length > 0 && (
              <optgroup label="📄 By Individual Statement File">
                {statements.map((stmt) => {
                  const cardLabel = stmt.cardName
                    ? `${stmt.cardName}${stmt.accountLast4 ? ` (*${stmt.accountLast4})` : ''}`
                    : stmt.accountLast4
                    ? `Card (*${stmt.accountLast4})`
                    : stmt.fileName;
                  return (
                    <option key={stmt.id} value={stmt.id}>
                      {cardLabel} — {stmt.periodEnd}
                    </option>
                  );
                })}
              </optgroup>
            )}
          </select>

          {activeStatement && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-sm)',
                  background: activeStatement.isReconciled ? 'var(--success-bg)' : 'var(--warning-bg)',
                  color: activeStatement.isReconciled ? 'var(--success)' : 'var(--warning)',
                  border: `1px solid ${activeStatement.isReconciled ? 'var(--success-border)' : 'var(--warning-border)'}`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <FileText size={12} />
                {selectedStatementId.startsWith('YEAR:')
                  ? 'Full Year Aggregate'
                  : selectedStatementId.startsWith('MONTH:')
                  ? 'Calendar Month Aggregate'
                  : `${activeStatement.fileType} • ${activeStatement.isReconciled ? 'Reconciled' : 'Discrepancy'}`}
              </span>

              {isIndividualFileSelected && (
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '3px 7px', color: 'var(--danger)', borderColor: 'var(--danger-border)' }}
                  onClick={() => setConfirmDelete(true)}
                  title="Delete this statement"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="topbar-actions">
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => refreshData()}
          title="Reload local IndexedDB state"
          disabled={isLoading}
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          <span>Sync</span>
        </button>

        {onOpenAddExpense && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={onOpenAddExpense}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Calendar size={14} color="var(--brand-primary)" />
            <span>+ Add Expense</span>
          </button>
        )}

        <button className="btn btn-primary" onClick={onOpenUpload}>
          <Upload size={16} />
          <span>Import Statement</span>
        </button>
      </div>

      {/* Single Statement Quick Delete Modal */}
      {confirmDelete && activeStatement && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(false)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Trash2 size={22} color="var(--danger)" />
                <h2 className="modal-title" style={{ color: 'var(--danger)' }}>
                  Remove Statement
                </h2>
              </div>
            </div>

            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Are you sure you want to remove <strong>{activeStatement.cardName || activeStatement.fileName}</strong> (Ending {activeStatement.periodEnd})?
              All of its associated transactions will be removed.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(false)} disabled={isDeleting}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDeleteActiveStatement} disabled={isDeleting}>
                {isDeleting ? 'Removing...' : 'Yes, Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
