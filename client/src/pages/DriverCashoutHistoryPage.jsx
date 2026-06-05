import { useEffect, useState } from 'react';
import { ArrowLeft, Wallet } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi';

const formatCurrency = (value) => `Rs ${Number(value || 0).toLocaleString()}`;

const getStatusClasses = (status) => {
  if (status === 'approved') return 'bg-cargo-success/20 text-cargo-success';
  if (status === 'rejected') return 'bg-cargo-danger/20 text-cargo-danger';
  return 'bg-cargo-accent/20 text-cargo-accent';
};

const DriverCashoutHistoryPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { get, loading } = useApi();
  const [requests, setRequests] = useState([]);
  const totalCashoutAmount = requests.reduce((sum, request) => sum + (Number(request.amount) || 0), 0);

  const driverName = location.state?.driverName || `Driver #${id}`;
  const driverUsername = location.state?.driverUsername || '';

  useEffect(() => {
    const fetchHistory = async () => {
      const result = await get('/admin/driver-cashout-requests', { params: { driver_id: id } });
      if (result.success) {
        setRequests(result.data.requests || []);
      }
    };

    fetchHistory();
  }, [get, id]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="btn-secondary flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div>
            <h1 className="text-2xl font-bold text-cargo-text">Driver Cashout History</h1>
            <p className="text-sm text-cargo-muted mt-1">
              {driverName}{driverUsername ? ` • @${driverUsername}` : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-cargo-border bg-cargo-card p-4">
          <p className="text-sm text-cargo-muted">Total Cashout Amount</p>
          <p className="text-2xl font-bold text-primary-300 mt-2">{formatCurrency(totalCashoutAmount)}</p>
        </div>
        <div className="rounded-xl border border-cargo-border bg-cargo-card p-4">
          <p className="text-sm text-cargo-muted">Total Requests</p>
          <p className="text-2xl font-bold text-cargo-text mt-2">{requests.length}</p>
        </div>
        <div className="rounded-xl border border-cargo-border bg-cargo-card p-4">
          <p className="text-sm text-cargo-muted">Approved Requests</p>
          <p className="text-2xl font-bold text-cargo-success mt-2">
            {requests.filter((request) => request.status === 'approved').length}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : requests.length ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {requests.map((request) => (
            <div key={request.id} className="rounded-xl border border-cargo-border bg-cargo-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-cargo-text">{formatCurrency(request.amount)}</p>
                  <p className="text-sm text-cargo-muted mt-1">
                    {request.balance_type} • {request.receive_method}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full capitalize ${getStatusClasses(request.status)}`}>
                  {request.status}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-cargo-border bg-cargo-dark/30 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-cargo-muted">Created</p>
                  <p className="text-cargo-text font-medium mt-1">{request.created_at ? new Date(request.created_at).toLocaleString() : 'N/A'}</p>
                </div>
                <div className="rounded-lg border border-cargo-border bg-cargo-dark/30 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-cargo-muted">Reviewed</p>
                  <p className="text-cargo-text font-medium mt-1">{request.reviewed_at ? new Date(request.reviewed_at).toLocaleString() : 'N/A'}</p>
                </div>
                <div className="rounded-lg border border-cargo-border bg-cargo-dark/30 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-cargo-muted">Account Name</p>
                  <p className="text-cargo-text font-medium mt-1">{request.account_name || 'N/A'}</p>
                </div>
                <div className="rounded-lg border border-cargo-border bg-cargo-dark/30 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-cargo-muted">Account Number</p>
                  <p className="text-cargo-text font-medium mt-1">{request.account_number || 'N/A'}</p>
                </div>
                <div className="rounded-lg border border-cargo-border bg-cargo-dark/30 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-cargo-muted">Bank</p>
                  <p className="text-cargo-text font-medium mt-1">{request.bank_name || 'N/A'}</p>
                </div>
                <div className="rounded-lg border border-cargo-border bg-cargo-dark/30 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-cargo-muted">Reviewed By</p>
                  <p className="text-cargo-text font-medium mt-1">{request.reviewed_by_username || 'N/A'}</p>
                </div>
              </div>

              {request.remarks ? (
                <div className="rounded-lg border border-cargo-border bg-cargo-dark/30 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-cargo-muted">Remarks</p>
                  <p className="text-cargo-text text-sm mt-1">{request.remarks}</p>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-cargo-border bg-cargo-card/30 p-10 text-center">
          <Wallet className="w-10 h-10 text-cargo-muted mx-auto mb-3" />
          <p className="text-cargo-text font-semibold">No cashout history found</p>
          <p className="text-sm text-cargo-muted mt-1">This driver has no recorded cashout requests yet.</p>
        </div>
      )}
    </div>
  );
};

export default DriverCashoutHistoryPage;
