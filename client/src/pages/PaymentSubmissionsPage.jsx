import { useEffect, useState } from 'react';
import {
  Wallet,
  Truck,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  Pencil,
  Eye,
  User,
  Car,
  Banknote,
  Receipt,
  ArrowRight,
  Filter,
  X,
  ChevronDown,
  CalendarDays,
} from 'lucide-react';
import { useApi } from '../hooks/useApi';
import Modal from '../components/common/Modal';

const formatCurrency = (value) => `Rs ${Number(value || 0).toLocaleString()}`;

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const TABS = ['pending', 'approved', 'rejected'];

const STATUS_CONFIG = {
  pending: { label: 'Pending', color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
  approved: { label: 'Approved', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  rejected: { label: 'Rejected', color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
};

const PaymentSubmissionsPage = () => {
  const { get, put, loading } = useApi();
  const [drivers, setDrivers] = useState([]);
  const [reportData, setReportData] = useState({ payments: [], driverTotals: [], summary: {} });
  const [filters, setFilters] = useState({
    status: 'pending',
    driver_id: '',
    month: new Date().toISOString().slice(0, 7),
    from_date: '',
    to_date: '',
  });
  const [submittingId, setSubmittingId] = useState(null);
  const [editingPayment, setEditingPayment] = useState(null);
  const [editForm, setEditForm] = useState({
    amount: '',
    payment_method: 'cash',
    sending_fee: '',
    handover_to: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const fetchDrivers = async () => {
    const result = await get('/admin/drivers');
    if (result.success) {
      setDrivers(result.data.drivers || []);
    }
  };

  const fetchPayments = async (activeFilters = filters) => {
    const params = {};
    if (activeFilters.status) params.status = activeFilters.status;
    if (activeFilters.driver_id) params.driver_id = activeFilters.driver_id;
    if (activeFilters.month) params.month = activeFilters.month;
    if (activeFilters.from_date) params.from_date = activeFilters.from_date;
    if (activeFilters.to_date) params.to_date = activeFilters.to_date;

    const result = await get('/admin/payment-submissions', { params });
    if (result.success) {
      setReportData(result.data);
    } else {
      alert(result.error);
    }
  };

  useEffect(() => {
    fetchDrivers();
    fetchPayments(filters);
  }, []);

  const handleStatusChange = async (paymentId, status) => {
    setSubmittingId(paymentId);
    const result = await put(`/admin/payment-submissions/${paymentId}/status`, { status });
    setSubmittingId(null);

    if (!result.success) {
      alert(result.error);
      return;
    }

    fetchPayments(filters);
  };

  const openEditModal = (payment) => {
    setEditingPayment(payment);
    setEditForm({
      amount: payment.amount ?? '',
      payment_method: payment.payment_method || 'cash',
      sending_fee: payment.sending_fee ?? '',
      handover_to: payment.handover_to || '',
    });
  };

  const closeEditModal = () => {
    setEditingPayment(null);
    setEditForm({
      amount: '',
      payment_method: 'cash',
      sending_fee: '',
      handover_to: '',
    });
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    if (!editingPayment) return;

    setSavingEdit(true);
    const result = await put(`/admin/payment-submissions/${editingPayment.id}`, editForm);
    setSavingEdit(false);

    if (!result.success) {
      alert(result.error);
      return;
    }

    closeEditModal();
    fetchPayments(filters);
  };

  const payments = reportData?.payments || [];
  const summary = reportData?.summary || {};

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 border border-slate-700">
          <Wallet className="w-5 h-5 text-sky-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Payment Submissions</h1>
          <p className="text-sm text-slate-500">Manage driver payment deposits</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-3">
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <Banknote className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">Received</span>
          </div>
          <p className="text-lg font-bold text-slate-100">{formatCurrency(summary.total_amount_received)}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-3">
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <Truck className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">Cargo Income</span>
          </div>
          <p className="text-lg font-bold text-slate-100">{formatCurrency(summary.total_cargo_income)}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-3">
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <TrendingUp className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">Net Profit</span>
          </div>
          <p className="text-lg font-bold text-emerald-400">{formatCurrency(summary.net_profit)}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-3">
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <Clock className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">Pending</span>
          </div>
          <p className="text-lg font-bold text-sky-400">{formatCurrency(summary.total_pending_amount)}</p>
        </div>
      </div>

      {/* Tabs & Filter Toggle */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-slate-900 border border-slate-800 p-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                const nextFilters = { ...filters, status: tab };
                setFilters(nextFilters);
                fetchPayments(nextFilters);
              }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                filters.status === tab
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          <Filter className="w-3.5 h-3.5" />
          Filters
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-400">Filter Options</span>
            <button onClick={() => setShowFilters(false)} className="text-slate-500 hover:text-slate-300">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            <select
              value={filters.driver_id}
              onChange={(e) => setFilters((prev) => ({ ...prev, driver_id: e.target.value }))}
              className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500/50"
            >
              <option value="">All Drivers</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>{driver.username}</option>
              ))}
            </select>
            <input
              type="month"
              value={filters.month}
              onChange={(e) => setFilters((prev) => ({ ...prev, month: e.target.value }))}
              className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500/50"
            />
            <input
              type="date"
              value={filters.from_date}
              onChange={(e) => setFilters((prev) => ({ ...prev, from_date: e.target.value }))}
              className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500/50"
              placeholder="From"
            />
            <input
              type="date"
              value={filters.to_date}
              onChange={(e) => setFilters((prev) => ({ ...prev, to_date: e.target.value }))}
              className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500/50"
              placeholder="To"
            />
            <button
              type="button"
              onClick={() => fetchPayments(filters)}
              className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      )}

      {/* Payment Cards */}
<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">        {payments.length ? (
          payments.map((payment) => {
            const cfg = STATUS_CONFIG[payment.status] || STATUS_CONFIG.pending;
            return (
              <div
                key={payment.id}
                className="rounded-lg border border-slate-800 bg-emerald-900/30 p-3 hover:border-slate-700 transition-colors"
              >
                {/* Card Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 border border-slate-700">
                      <User className="w-4 h-4 text-slate-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-100 truncate">{payment.driver_name}</p>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                        <Car className="w-3 h-3" />
                        <span>{payment.car_number || 'No car'}</span>
                      </div>
                    </div>
                  </div>
                  <span className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
                    {payment.status === 'approved' && <CheckCircle2 className="w-3 h-3" />}
                    {payment.status === 'rejected' && <XCircle className="w-3 h-3" />}
                    {payment.status === 'pending' && <Clock className="w-3 h-3" />}
                    {cfg.label}
                  </span>
                </div>

                {/* Amount & Method */}
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-2xl font-bold text-slate-100">{formatCurrency(payment.amount)}</p>
                    <p className="text-xs text-slate-500 capitalize mt-0.5">{payment.payment_method}</p>
                  </div>
                  {payment.screenshot_image && (
                    <a
                      href={payment.screenshot_image}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 rounded-md bg-slate-800 border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:text-sky-400 hover:border-sky-500/30 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Screenshot
                    </a>
                  )}
                </div>

                {/* Details */}
                <div className="rounded-md bg-slate-950/50 border border-slate-800/50 p-2.5 mb-3">
                  {payment.payment_method === 'cash' ? (
                    <div className="flex items-center gap-2 text-sm">
                      <Receipt className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="text-slate-500">Handover to:</span>
                      <span className="text-slate-300 font-medium">{payment.handover_to || 'N/A'}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm">
                      <Receipt className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="text-slate-500">Sending fee:</span>
                      <span className="text-slate-300 font-medium">{formatCurrency(payment.sending_fee)}</span>
                    </div>
                  )}
                </div>

                {/* Dates */}
                <div className="flex items-center gap-3 text-xs text-slate-600 mb-3">
                  <div className="flex items-center gap-1">
                    <CalendarDays className="w-3 h-3" />
                    <span>Submitted {formatDateTime(payment.submitted_at)}</span>
                  </div>
                  {payment.status_updated_at && payment.status !== 'pending' && (
                    <div className="flex items-center gap-1">
                      <ArrowRight className="w-3 h-3" />
                      <span>Updated {formatDateTime(payment.status_updated_at)}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                {payment.status === 'pending' && (
                  <div className="flex items-center gap-2 pt-3 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => openEditModal(payment)}
                      disabled={submittingId === payment.id}
                      className="flex items-center gap-1.5 rounded-md bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-slate-100 disabled:opacity-40 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusChange(payment.id, 'approved')}
                      disabled={submittingId === payment.id}
                      className="flex items-center gap-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 transition-colors"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusChange(payment.id, 'rejected')}
                      disabled={submittingId === payment.id}
                      className="flex items-center gap-1.5 rounded-md bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 text-xs font-medium text-rose-400 hover:bg-rose-500/20 disabled:opacity-40 transition-colors"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Reject
                    </button>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-8 text-center">
            <Receipt className="w-8 h-8 text-slate-700 mx-auto mb-2" />
            <p className="text-sm text-slate-500">
              {loading ? 'Loading submissions...' : 'No submissions found.'}
            </p>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <Modal isOpen={Boolean(editingPayment)} onClose={closeEditModal} title="Edit Payment">
        <form onSubmit={handleEditSave} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">Amount</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={editForm.amount}
                onChange={(e) => setEditForm((prev) => ({ ...prev, amount: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500/50"
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">Method</label>
              <select
                value={editForm.payment_method}
                onChange={(e) => setEditForm((prev) => ({ ...prev, payment_method: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500/50"
              >
                <option value="cash">Cash</option>
                <option value="account">Account</option>
              </select>
            </div>
            {editForm.payment_method === 'cash' ? (
              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-medium text-slate-500">Handover To</label>
                <input
                  type="text"
                  value={editForm.handover_to}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, handover_to: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500/50"
                  placeholder="Person name"
                />
              </div>
            ) : (
              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-medium text-slate-500">Sending Fee</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editForm.sending_fee}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, sending_fee: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500/50"
                  placeholder="0.00"
                />
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={closeEditModal}
              className="flex-1 rounded-md border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingEdit}
              className="flex-1 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50 transition-colors"
            >
              {savingEdit ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default PaymentSubmissionsPage;