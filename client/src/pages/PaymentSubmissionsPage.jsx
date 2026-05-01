import { useEffect, useState } from 'react';
import { CalendarDays, CheckCircle2, Eye, Truck, Wallet, XCircle } from 'lucide-react';
import { useApi } from '../hooks/useApi';

const formatCurrency = (value) => `Rs ${Number(value || 0).toLocaleString()}`;

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const TABS = ['pending', 'approved', 'rejected'];

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

  const payments = reportData?.payments || [];
  const summary = reportData?.summary || {};

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-cargo-border bg-gradient-to-r from-cargo-card to-cargo-dark p-5">
        <h1 className="text-2xl font-bold text-cargo-text flex items-center gap-2">
          <Wallet className="w-6 h-6 text-primary-400" />
          Payment Submissions
        </h1>
        <p className="text-cargo-muted mt-1">Track deposits, approve requests, and compare received payments against cargo income.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-sm text-cargo-muted flex items-center gap-2"><Wallet className="w-4 h-4" />Total Amount Received</p>
          <p className="text-2xl font-bold text-cargo-text mt-1">{formatCurrency(summary.total_amount_received)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-cargo-muted flex items-center gap-2"><Truck className="w-4 h-4" />Total Cargo Income</p>
          <p className="text-2xl font-bold text-cargo-text mt-1">{formatCurrency(summary.total_cargo_income)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-cargo-muted flex items-center gap-2"><CalendarDays className="w-4 h-4" />Net Profit</p>
          <p className="text-2xl font-bold text-cargo-text mt-1">{formatCurrency(summary.net_profit)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-cargo-muted flex items-center gap-2"><CalendarDays className="w-4 h-4" />Pending Amount</p>
          <p className="text-2xl font-bold text-cargo-text mt-1">{formatCurrency(summary.total_pending_amount)}</p>
        </div>
      </div>

      <div className="card space-y-4">
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                const nextFilters = { ...filters, status: tab };
                setFilters(nextFilters);
                fetchPayments(nextFilters);
              }}
              className={filters.status === tab ? 'btn-primary' : 'btn-secondary'}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          <select
            value={filters.driver_id}
            onChange={(e) => setFilters((prev) => ({ ...prev, driver_id: e.target.value }))}
            className="input-field w-full"
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
            className="input-field w-full"
          />
          <input
            type="date"
            value={filters.from_date}
            onChange={(e) => setFilters((prev) => ({ ...prev, from_date: e.target.value }))}
            className="input-field w-full"
          />
          <input
            type="date"
            value={filters.to_date}
            onChange={(e) => setFilters((prev) => ({ ...prev, to_date: e.target.value }))}
            className="input-field w-full"
          />
          <button type="button" onClick={() => fetchPayments(filters)} className="btn-primary">
            Apply Filter
          </button>
        </div>
      </div>

      <div className="card space-y-4 overflow-x-auto">
        <div>
          <h2 className="text-lg font-semibold text-cargo-text">Submission Table</h2>
          <p className="text-cargo-muted text-sm mt-1">Approve or reject payment requests and review proof for account deposits.</p>
        </div>

        <table className="w-full min-w-[1200px]">
          <thead>
            <tr className="border-b border-cargo-border text-left">
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Driver Name</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Car Number</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Amount</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Payment Method</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Details</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Screenshot</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Status</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Submitted</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Updated</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            {payments.length ? payments.map((payment) => (
              <tr key={payment.id} className="border-b border-cargo-border/60">
                <td className="py-3 pr-4 text-sm text-cargo-text">{payment.driver_name}</td>
                <td className="py-3 pr-4 text-sm text-cargo-text">{payment.car_number || 'N/A'}</td>
                <td className="py-3 pr-4 text-sm font-semibold text-primary-400">{formatCurrency(payment.amount)}</td>
                <td className="py-3 pr-4 text-sm text-cargo-text capitalize">{payment.payment_method}</td>
                <td className="py-3 pr-4 text-sm text-cargo-muted">
                  {payment.payment_method === 'cash'
                    ? `Handover: ${payment.handover_to || 'N/A'}`
                    : `Fee: ${formatCurrency(payment.sending_fee)}`}
                </td>
                <td className="py-3 pr-4 text-sm text-cargo-text">
                  {payment.screenshot_image ? (
                    <a
                      href={payment.screenshot_image}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-primary-400 hover:text-primary-300"
                    >
                      <Eye className="w-4 h-4" />
                      Preview
                    </a>
                  ) : (
                    'No screenshot'
                  )}
                </td>
                <td className="py-3 pr-4 text-sm">
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                    payment.status === 'approved'
                      ? 'bg-cargo-success/15 text-cargo-success'
                      : payment.status === 'rejected'
                        ? 'bg-cargo-danger/15 text-cargo-danger'
                        : 'bg-cargo-accent/15 text-cargo-accent'
                  }`}>
                    {payment.status}
                  </span>
                </td>
                <td className="py-3 pr-4 text-sm text-cargo-muted">{formatDateTime(payment.submitted_at)}</td>
                <td className="py-3 pr-4 text-sm text-cargo-muted">{formatDateTime(payment.status_updated_at)}</td>
                <td className="py-3 pr-4 text-sm">
                  {payment.status === 'pending' ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleStatusChange(payment.id, 'approved')}
                        disabled={submittingId === payment.id}
                        className="inline-flex items-center gap-1 rounded-lg bg-cargo-success/15 px-3 py-2 text-cargo-success hover:bg-cargo-success/25 disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStatusChange(payment.id, 'rejected')}
                        disabled={submittingId === payment.id}
                        className="inline-flex items-center gap-1 rounded-lg bg-cargo-danger/15 px-3 py-2 text-cargo-danger hover:bg-cargo-danger/25 disabled:opacity-50"
                      >
                        <XCircle className="w-4 h-4" />
                        Reject
                      </button>
                    </div>
                  ) : (
                    <span className="text-cargo-muted">No action</span>
                  )}
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan="10" className="py-6 text-center text-cargo-muted">
                  {loading ? 'Loading submissions...' : 'No rows found for this tab/filter.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PaymentSubmissionsPage;
