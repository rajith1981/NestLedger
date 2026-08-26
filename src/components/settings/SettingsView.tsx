import React, { useState } from 'react';
import { Trash2, Download, Upload, Shield, AlertTriangle, Check, RefreshCw, CreditCard, FileText, Edit2, CheckCircle2 } from 'lucide-react';
import { useStatements } from '../../context/StatementContext';
import { formatCurrency } from '../../engine/money';
import { Statement } from '../../types/statement';

export const SettingsView: React.FC = () => {
  const {
    statements,
    allTransactions,
    accounts,
    categories,
    rules,
    goals,
    wipeData,
    deleteStatement,
    renameStatement,
    updateAccountDetails,
    refreshData,
    importBackupData
  } = useStatements();

  const [showWipeModal, setShowWipeModal] = useState<boolean>(false);
  const [isWiping, setIsWiping] = useState<boolean>(false);
  const [wipeSuccess, setWipeSuccess] = useState<boolean>(false);

  // Single statement deletion state
  const [statementToDelete, setStatementToDelete] = useState<Statement | null>(null);
  const [isDeletingStmt, setIsDeletingStmt] = useState<boolean>(false);

  // Statement renaming state
  const [editingStmtId, setEditingStmtId] = useState<string | null>(null);
  const [newStmtName, setNewStmtName] = useState<string>('');

  // Account editing state
  const primaryAccount = accounts[0];
  const [aprPurchase, setAprPurchase] = useState<number>(primaryAccount?.aprPurchase || 24.99);
  const [accountName, setAccountName] = useState<string>(primaryAccount?.name || 'Primary Card');
  const [accSaved, setAccSaved] = useState<boolean>(false);

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!primaryAccount) return;

    await updateAccountDetails({
      ...primaryAccount,
      name: accountName,
      aprPurchase: Number(aprPurchase)
    });

    setAccSaved(true);
    setTimeout(() => setAccSaved(false), 2000);
  };

  const handleStartRename = (stmt: Statement) => {
    setEditingStmtId(stmt.id);
    setNewStmtName(stmt.cardName || stmt.fileName);
  };

  const handleSaveRename = async (stmtId: string) => {
    if (newStmtName.trim()) {
      await renameStatement(stmtId, newStmtName.trim());
    }
    setEditingStmtId(null);
  };

  const handleConfirmDeleteStatement = async () => {
    if (!statementToDelete) return;
    setIsDeletingStmt(true);
    try {
      await deleteStatement(statementToDelete.id);
      setStatementToDelete(null);
    } catch (err) {
      console.error('Failed to delete statement:', err);
    } finally {
      setIsDeletingStmt(false);
    }
  };

  const handleExportBackup = () => {
    const backupData = {
      exportedAt: new Date().toISOString(),
      version: '1.0.0',
      statements,
      transactions: allTransactions,
      accounts,
      categories,
      rules,
      goals
    };

    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(backupData, null, 2))}`;
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', jsonString);
    downloadAnchor.setAttribute('download', `statements_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleImportFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportError(null);
    setImportSuccess(null);

    try {
      const text = await file.text();
      const backupObj = JSON.parse(text);
      await (window as any).importBackupDataDirect?.(backupObj) || importBackupData(backupObj);
      setImportSuccess(`Successfully restored backup from "${file.name}"!`);
      setTimeout(() => setImportSuccess(null), 4000);
    } catch (err: any) {
      console.error('Failed to import backup:', err);
      setImportError(err?.message || 'Failed to parse and restore JSON backup file.');
    } finally {
      setIsImporting(false);
      e.target.value = '';
    }
  };

  const handleConfirmWipe = async () => {
    setIsWiping(true);
    try {
      await wipeData();
      setShowWipeModal(false);
      setWipeSuccess(true);
      setTimeout(() => setWipeSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to wipe data:', err);
    } finally {
      setIsWiping(false);
    }
  };

  return (
    <div className="page-wrapper" style={{ maxWidth: '960px' }}>
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <div>
            <h2 className="card-title">Settings & Statement Management</h2>
            <p className="card-desc">Manage individual statements, configure APRs, export backups, and control local IndexedDB storage</p>
          </div>
        </div>
      </div>

      {wipeSuccess && (
        <div
          style={{
            background: 'var(--success-bg)',
            border: '1px solid var(--success-border)',
            color: 'var(--success)',
            padding: '1rem',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem'
          }}
        >
          <Check size={18} />
          <span>Local database wiped successfully and default category taxonomy was re-seeded.</span>
        </div>
      )}

      {/* Individual Statements Management Card */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <FileText size={20} color="var(--brand-primary)" />
            <div>
              <h3 className="card-title">Manage Imported Statements ({statements.length})</h3>
              <p className="card-desc">Rename cards, inspect reconciliation, or delete statements one by one</p>
            </div>
          </div>
        </div>

        {statements.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No statements imported yet. Click "Import Statement" in the top bar to get started.
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Statement / Card Name</th>
                  <th>Period Ending</th>
                  <th>Purchases</th>
                  <th>Ending Balance</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {statements.map(stmt => {
                  const stmtTxs = allTransactions.filter(t => t.statementId === stmt.id);
                  const isEditing = editingStmtId === stmt.id;

                  return (
                    <tr key={stmt.id}>
                      <td style={{ minWidth: '220px' }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <input
                              type="text"
                              className="input-control"
                              value={newStmtName}
                              onChange={e => setNewStmtName(e.target.value)}
                              autoFocus
                              style={{ padding: '4px 8px', fontSize: '0.85rem' }}
                            />
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => handleSaveRename(stmt.id)}
                              style={{ padding: '4px 8px' }}
                            >
                              Save
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => setEditingStmtId(null)}
                              style={{ padding: '4px 8px' }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div>
                            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span>{stmt.cardName || stmt.fileName}</span>
                              {stmt.accountLast4 && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                  (*{stmt.accountLast4})
                                </span>
                              )}
                              <button
                                onClick={() => handleStartRename(stmt)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }}
                                title="Rename statement"
                              >
                                <Edit2 size={12} />
                              </button>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {stmtTxs.length} transactions • {stmt.fileType}
                            </div>
                          </div>
                        )}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                        {stmt.periodEnd}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.85rem' }}>
                        {formatCurrency(stmt.purchases)}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.85rem' }}>
                        {formatCurrency(stmt.newBalance)}
                      </td>
                      <td>
                        {stmt.isReconciled ? (
                          <span className="badge badge-success" style={{ fontSize: '0.72rem' }}>
                            <CheckCircle2 size={11} /> Reconciled
                          </span>
                        ) : (
                          <span className="badge badge-warning" style={{ fontSize: '0.72rem' }}>
                            <AlertTriangle size={11} /> Discrepancy
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => setStatementToDelete(stmt)}
                          title={`Delete ${stmt.cardName || stmt.fileName}`}
                          style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                        >
                          <Trash2 size={13} /> Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Account APR Configuration */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <CreditCard size={20} color="var(--brand-primary)" />
            <h3 className="card-title">Credit Card & APR Settings</h3>
          </div>
        </div>

        <form onSubmit={handleSaveAccount} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Account Display Name
              </label>
              <input
                type="text"
                className="input-control"
                value={accountName}
                onChange={e => setAccountName(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Purchase APR (% per annum)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="99.99"
                className="input-control"
                value={aprPurchase}
                onChange={e => setAprPurchase(parseFloat(e.target.value) || 0)}
                required
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem' }}>
            {accSaved && <span style={{ color: 'var(--success)', fontSize: '0.85rem' }}>Saved!</span>}
            <button type="submit" className="btn btn-primary btn-sm">
              Save Account Settings
            </button>
          </div>
        </form>
      </div>

      {/* Backup, Share & Export */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Download size={20} color="var(--brand-primary)" />
            <div>
              <h3 className="card-title">Family Share, Backup & Restore</h3>
              <p className="card-desc">Export a complete snapshot to share with family or restore on another phone/browser</p>
            </div>
          </div>
        </div>

        {importSuccess && (
          <div
            style={{
              background: 'var(--success-bg)',
              border: '1px solid var(--success-border)',
              color: 'var(--success)',
              padding: '0.85rem',
              borderRadius: 'var(--radius-md)',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.88rem'
            }}
          >
            <CheckCircle2 size={18} />
            <span>{importSuccess}</span>
          </div>
        )}

        {importError && (
          <div
            style={{
              background: 'var(--danger-bg)',
              border: '1px solid var(--danger-border)',
              color: 'var(--danger)',
              padding: '0.85rem',
              borderRadius: 'var(--radius-md)',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.88rem'
            }}
          >
            <AlertTriangle size={18} />
            <span>{importError}</span>
          </div>
        )}

        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
          Download a complete JSON snapshot containing all imported statements ({statements.length}), transactions (
          {allTransactions.length}), categories ({categories.length}), rules, and custom labels. Send this file to your spouse to restore the identical financial ledger on her device.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={handleExportBackup}>
            <Download size={16} /> Download Family JSON Backup
          </button>

          <label className="btn btn-primary" style={{ cursor: isImporting ? 'not-allowed' : 'pointer', margin: 0 }}>
            <Upload size={16} />
            <span>{isImporting ? 'Restoring Data...' : 'Import / Restore Backup File'}</span>
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleImportFileSelected}
              disabled={isImporting}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      </div>

      {/* Database Wipe (SPEC 6) */}
      <div className="card" style={{ borderColor: 'var(--danger-border)', background: 'rgba(244, 63, 94, 0.03)' }}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Trash2 size={20} color="var(--danger)" />
            <h3 className="card-title" style={{ color: 'var(--danger)' }}>
              Wipe All Local Data
            </h3>
          </div>
        </div>

        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
          This action will erase all imported statements, transactions, and custom goals from IndexedDB on this browser.
          Default categories and classification rules will be <strong>immediately re-seeded</strong> so the application
          remains fully functional without orphaned data.
        </p>

        <button className="btn btn-danger" onClick={() => setShowWipeModal(true)}>
          <Trash2 size={16} /> Wipe All Local Data
        </button>
      </div>

      {/* Single Statement Delete Confirmation Modal */}
      {statementToDelete && (
        <div className="modal-overlay" onClick={() => setStatementToDelete(null)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: '460px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Trash2 size={22} color="var(--danger)" />
                <h2 className="modal-title" style={{ color: 'var(--danger)' }}>
                  Remove Statement
                </h2>
              </div>
            </div>

            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Are you sure you want to remove <strong>{statementToDelete.cardName || statementToDelete.fileName}</strong> (Ending {statementToDelete.periodEnd})?
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              All {allTransactions.filter(t => t.statementId === statementToDelete.id).length} transactions associated with this statement will also be deleted.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button className="btn btn-secondary" onClick={() => setStatementToDelete(null)} disabled={isDeletingStmt}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleConfirmDeleteStatement} disabled={isDeletingStmt}>
                {isDeletingStmt ? 'Removing...' : 'Yes, Remove Statement'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wipe Confirmation Modal */}
      {showWipeModal && (
        <div className="modal-overlay" onClick={() => setShowWipeModal(false)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: '460px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <AlertTriangle size={24} color="var(--danger)" />
                <h2 className="modal-title" style={{ color: 'var(--danger)' }}>
                  Confirm Database Wipe
                </h2>
              </div>
            </div>

            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Are you sure you want to delete all {statements.length} statements and {allTransactions.length} transactions?
              This operation cannot be undone.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button className="btn btn-secondary" onClick={() => setShowWipeModal(false)} disabled={isWiping}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleConfirmWipe} disabled={isWiping}>
                {isWiping ? 'Wiping...' : 'Yes, Wipe & Re-seed'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
