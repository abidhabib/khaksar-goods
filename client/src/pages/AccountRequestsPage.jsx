import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Pencil, Receipt, Route, XCircle } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import Modal from '../components/common/Modal';

const formatCurrency = (value) => `Rs ${Number(value || 0).toLocaleString()}`;
const formatVariancePercent = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 'N/A';
  return `${numericValue > 0 ? '+' : ''}${numericValue.toFixed(2)}%`;
};
const formatAverage = (value) => {
  const numericValue = Number(value || 0);
  return numericValue > 0 ? `${numericValue.toFixed(2)} km/L` : 'N/A';
};
const formatDate = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString();
};
const formatCategoryLabel = (value) =>
  String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

const expenseCategoryOrder = [
  'diesel',
  'toll',
  'food',
  'police',
  'chalaan',
  'mandi_kaat',
  'reward',
  'tyre_puncture',
  'bilty_commission',
];

const sortExpensesByCategory = (expenses = []) => [...expenses].sort((left, right) => {
  const leftIndex = expenseCategoryOrder.indexOf(left.category);
  const rightIndex = expenseCategoryOrder.indexOf(right.category);

  if (leftIndex === -1 && rightIndex === -1) {
    return String(left.category || '').localeCompare(String(right.category || ''));
  }

  if (leftIndex === -1) return 1;
  if (rightIndex === -1) return -1;
  if (leftIndex !== rightIndex) return leftIndex - rightIndex;

  return (new Date(left.created_at).getTime() || 0) - (new Date(right.created_at).getTime() || 0);
});

const AccountRequestsPage = () => {
  const { get, put } = useApi();
  const [commissionRequests, setCommissionRequests] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [editingRequest, setEditingRequest] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);

  const loadRequests = useCallback(async () => {
    const commissionResult = await get('/admin/driver-commission-requests');
    if (commissionResult.success) {
      setCommissionRequests(commissionResult.data.requests || []);
    }
  }, [get]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadRequests();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadRequests]);

  const handleStatusChange = async (requestId, status) => {
    setBusyId(requestId);
    const result = await put(`/admin/driver-commission-requests/${requestId}/status`, { status });
    setBusyId(null);

    if (!result.success) {
      alert(result.error);
      return;
    }

    loadRequests();
  };

  const openEditModal = (row) => {
    setEditingRequest(row);
    setEditForm({
      commission_percentage: row.commission_percentage ?? '',
      net_profit: row.net_profit ?? '',
      commission_amount: row.commission_amount ?? '',
      remarks: row.remarks || '',
    });
  };

  const closeEditModal = () => {
    setEditingRequest(null);
    setEditForm({});
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    if (!editingRequest?.request_id) return;

    setSavingEdit(true);
    const result = await put(`/admin/driver-commission-requests/${editingRequest.request_id}`, editForm);
    setSavingEdit(false);

    if (!result.success) {
      alert(result.error);
      return;
    }

    closeEditModal();
    loadRequests();
  };

  return (
    <>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-cargo-text">Commission Requests</h1>
        </div>

        {commissionRequests.length ? (
          <div className="space-y-4">
            {commissionRequests.map((row) => {
              const pending = row.status === 'pending';
              const sortedExpenses = sortExpensesByCategory(row.expenses || []);
              const distance = Math.max((row.end_meter_reading || 0) - (row.start_meter_reading || 0), 0);

              return (
                <article key={row.request_id} className="rounded-lg border border-cargo-border bg-cargo-card p-4 space-y-4">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-lg font-semibold text-cargo-text flex items-center gap-2">
                        <Route className="w-4 h-4 text-primary-400" />
                        {row.from_location} to {row.to_location}
                      </p>
                      <p className="text-sm text-cargo-muted">
                        {row.driver_full_name || row.driver_username} • {row.car_number || 'No cargo'} • Trip #{row.trip_id}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-lg bg-primary-500/10 px-3 py-2 text-sm font-medium text-primary-300">
                        Commission {formatCurrency(row.commission_amount)}
                      </span>
                      <span className="rounded-lg bg-cargo-dark px-3 py-2 text-sm font-medium text-cargo-text capitalize">
                        {row.status}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
                    {[
                      { label: 'Freight', value: formatCurrency(row.freight_charge), tone: 'text-cargo-text' },
                      { label: 'Net Income', value: formatCurrency(row.net_income), tone: 'text-cargo-success' },
                      { label: 'Commission %', value: `${Number(row.commission_percentage || 0)}%`, tone: 'text-cargo-text' },
                      { label: 'Rent Up/Down', value: formatVariancePercent(row.freight_variance_percentage), tone: row.freight_variance_direction === 'down' ? 'text-cargo-danger' : row.freight_variance_direction === 'up' ? 'text-cargo-success' : 'text-cargo-text' },
                      { label: 'Distance', value: `${distance.toLocaleString()} km`, tone: 'text-cargo-text' },
                      { label: 'Trip Avg', value: formatAverage(row.trip_average_km_per_liter), tone: 'text-cargo-text' },
                      { label: 'Bilty Commission', value: formatCurrency(row.bilty_commission_amount), tone: 'text-cargo-text' },
                      { label: 'Created', value: formatDate(row.created_at), tone: 'text-cargo-text' },
                    ].map((item) => (
                      <div key={item.label} className="rounded-lg border border-cargo-border bg-cargo-dark/20 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-cargo-muted">{item.label}</p>
                        <p className={`mt-1.5 text-sm font-semibold ${item.tone}`}>{item.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="rounded-lg border border-cargo-border bg-cargo-dark/20 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-cargo-muted">Started</p>
                      <p className="mt-1.5 text-sm font-semibold text-cargo-text">{formatDate(row.started_at)}</p>
                    </div>
                    <div className="rounded-lg border border-cargo-border bg-cargo-dark/20 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-cargo-muted">Ended</p>
                      <p className="mt-1.5 text-sm font-semibold text-cargo-text">{formatDate(row.ended_at)}</p>
                    </div>
                    <div className="rounded-lg border border-cargo-border bg-cargo-dark/20 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-cargo-muted">Load</p>
                      <p className="mt-1.5 text-sm font-semibold text-cargo-text">
                        {[row.load_name, row.load_weight].filter(Boolean).join(' • ') || 'N/A'}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-cargo-border bg-cargo-dark/20 p-3">
                    <p className="text-sm font-semibold text-cargo-text flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-cargo-muted" />
                      Expense Breakdown
                    </p>

                    {sortedExpenses.length ? (
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {sortedExpenses.map((expense) => (
                          <div key={expense.id} className="rounded-lg border border-cargo-border/60 bg-cargo-card/40 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-medium text-cargo-text">{formatCategoryLabel(expense.category)}</p>
                              <p className="text-sm font-semibold text-cargo-text">{formatCurrency(expense.amount)}</p>
                            </div>
                            <p className="mt-1 text-xs text-cargo-muted">{formatDate(expense.created_at)}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-cargo-muted">No expense entries on this trip.</p>
                    )}
                  </div>

                  {pending ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => openEditModal(row)}
                        disabled={busyId === row.request_id}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary-500/15 px-3 py-2 text-sm text-primary-300"
                      >
                        <Pencil className="w-4 h-4" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleStatusChange(row.request_id, 'approved')}
                        disabled={busyId === row.request_id}
                        className="inline-flex items-center gap-2 rounded-lg bg-cargo-success/15 px-3 py-2 text-sm text-cargo-success"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Approve
                      </button>
                      <button
                        onClick={() => handleStatusChange(row.request_id, 'rejected')}
                        disabled={busyId === row.request_id}
                        className="inline-flex items-center gap-2 rounded-lg bg-cargo-danger/15 px-3 py-2 text-sm text-cargo-danger"
                      >
                        <XCircle className="w-4 h-4" />
                        Reject
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="card text-sm text-cargo-muted">No commission requests found.</div>
        )}
      </div>

      <Modal
        isOpen={Boolean(editingRequest)}
        onClose={closeEditModal}
        title="Edit Commission Request"
      >
        <form onSubmit={handleEditSave} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="number"
              min="0"
              step="0.01"
              value={editForm.commission_percentage || ''}
              onChange={(e) => setEditForm((prev) => ({ ...prev, commission_percentage: e.target.value }))}
              className="input-field w-full"
              placeholder="Commission %"
            />
            <input
              type="number"
              min="0"
              step="0.01"
              value={editForm.net_profit || ''}
              onChange={(e) => setEditForm((prev) => ({ ...prev, net_profit: e.target.value }))}
              className="input-field w-full"
              placeholder="Net Profit"
            />
            <input
              type="number"
              min="0"
              step="0.01"
              value={editForm.commission_amount || ''}
              onChange={(e) => setEditForm((prev) => ({ ...prev, commission_amount: e.target.value }))}
              className="input-field w-full md:col-span-2"
              placeholder="Commission Amount"
            />
          </div>

          <textarea
            value={editForm.remarks || ''}
            onChange={(e) => setEditForm((prev) => ({ ...prev, remarks: e.target.value }))}
            className="input-field w-full min-h-24"
            placeholder="Remarks"
          />

          <div className="flex gap-3">
            <button type="button" onClick={closeEditModal} className="flex-1 btn-secondary">Cancel</button>
            <button type="submit" disabled={savingEdit} className="flex-1 btn-primary">
              {savingEdit ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
};

export default AccountRequestsPage;
