import React, { useState } from 'react';
import {
  X,
  Plus,
  DollarSign,
  Calendar,
  Home,
  Zap,
  Phone,
  Shield,
  Repeat,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { useStatements } from '../../context/StatementContext';
import { formatCurrency, parseAmountToCents } from '../../engine/money';

interface AddExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AddExpenseModal: React.FC<AddExpenseModalProps> = ({ isOpen, onClose }) => {
  const { categories, availableMonths, addManualExpense } = useStatements();

  const [description, setDescription] = useState<string>('');
  const [amountStr, setAmountStr] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('cat_housing');
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [isRecurring, setIsRecurring] = useState<boolean>(true);
  const [selectedMonths, setSelectedMonths] = useState<string[]>(() =>
    availableMonths.map((m) => m.monthKey)
  );
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const presets = [
    { label: 'Mortgage / Rent', desc: 'Mortgage Payment', catId: 'cat_housing', icon: <Home size={14} /> },
    { label: 'Phone Bill', desc: 'Mobile Phone Bill', catId: 'cat_utilities', icon: <Phone size={14} /> },
    { label: 'Gas / Heating', desc: 'Gas Utility Bill', catId: 'cat_utilities', icon: <Zap size={14} /> },
    { label: 'Electric / Power', desc: 'Electric Power Utility', catId: 'cat_utilities', icon: <Zap size={14} /> },
    { label: 'Internet', desc: 'Home Internet', catId: 'cat_utilities', icon: <Zap size={14} /> },
    { label: 'Auto Insurance', desc: 'Car Insurance', catId: 'cat_insurance', icon: <Shield size={14} /> }
  ];

  const handleApplyPreset = (p: typeof presets[0]) => {
    setDescription(p.desc);
    setCategoryId(p.catId);
  };

  const handleToggleMonth = (mKey: string) => {
    if (selectedMonths.includes(mKey)) {
      setSelectedMonths(selectedMonths.filter((k) => k !== mKey));
    } else {
      setSelectedMonths([...selectedMonths, mKey]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = parseAmountToCents(amountStr);
    if (!description.trim() || cents <= 0) return;

    setIsSaving(true);
    try {
      await addManualExpense({
        description: description.trim(),
        amountCents: cents,
        categoryId,
        date,
        isRecurring,
        recurrenceMonths: isRecurring ? selectedMonths : undefined
      });

      setSuccessMessage(
        isRecurring
          ? `Added "${description.trim()}" ($${(cents / 100).toFixed(2)}) across ${selectedMonths.length} months!`
          : `Added "${description.trim()}" ($${(cents / 100).toFixed(2)}) for ${date}!`
      );

      setTimeout(() => {
        setSuccessMessage(null);
        setDescription('');
        setAmountStr('');
        setIsSaving(false);
        onClose();
      }, 1200);
    } catch (err) {
      console.error('Failed to save manual expense:', err);
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: '540px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Add Checking / Bank Expense</h2>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Include mortgage, phone bill, gas, utilities, and fixed bank payments
            </p>
          </div>
          <button className="btn-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Quick Presets */}
        <div style={{ marginBottom: '1.25rem' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
            Quick Bill Presets:
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {presets.map((p, idx) => (
              <button
                key={idx}
                type="button"
                className="btn btn-secondary btn-sm"
                style={{
                  fontSize: '0.78rem',
                  padding: '4px 9px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
                onClick={() => handleApplyPreset(p)}
              >
                {p.icon}
                <span>{p.label}</span>
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Expense Description */}
          <div>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              Expense / Bill Name *
            </label>
            <input
              type="text"
              className="input-control"
              placeholder="e.g. Mortgage Payment, Verizon Wireless, Gas Utility"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          {/* Amount and Category Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Amount ($ USD) *
              </label>
              <div style={{ position: 'relative' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                    fontWeight: 600
                  }}
                >
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="input-control"
                  style={{ paddingLeft: '24px', fontFamily: 'var(--font-mono)' }}
                  placeholder="1850.00"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Category *
              </label>
              <select
                className="select-control"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Date & Account Source */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Payment Date / Day *
              </label>
              <input
                type="date"
                className="input-control"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Source Account
              </label>
              <div
                style={{
                  background: 'var(--bg-surface-raised)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.55rem 0.75rem',
                  fontSize: '0.82rem',
                  color: 'var(--brand-primary)',
                  fontWeight: 600
                }}
              >
                Checking / Bank Account
              </div>
            </div>
          </div>

          {/* Recurring Bill Checkbox & Month Selector */}
          <div
            style={{
              background: 'var(--bg-surface-raised)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '0.85rem 1rem'
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
              />
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Repeat size={14} color="var(--brand-primary)" />
                Monthly Recurring Bill (Apply across tracked months)
              </span>
            </label>

            {isRecurring && availableMonths.length > 0 && (
              <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Select months to populate:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {availableMonths.map((m) => {
                    const isSelected = selectedMonths.includes(m.monthKey);
                    return (
                      <button
                        key={m.monthKey}
                        type="button"
                        onClick={() => handleToggleMonth(m.monthKey)}
                        className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                      >
                        {m.monthLabel}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Success Message Banner */}
          {successMessage && (
            <div
              style={{
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid var(--success)',
                borderRadius: 'var(--radius-md)',
                padding: '0.65rem 1rem',
                fontSize: '0.85rem',
                color: 'var(--success)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <CheckCircle2 size={16} />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Modal Footer Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSaving}>
              <Plus size={16} />
              <span>{isSaving ? 'Saving...' : 'Save Checking Expense'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
