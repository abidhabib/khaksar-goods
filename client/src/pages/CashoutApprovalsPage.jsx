import { useEffect, useMemo, useState } from 'react';
import { Banknote, CheckCircle2, Clock, HandHelping, User, XCircle } from 'lucide-react';
import { useApi } from '../hooks/useApi';

const STATUS_TABS = ['pending', 'approved', 'rejected'];

const formatCurrency = (value) => `Rs ${Number(value || 0).toLocaleString()}`;

const formatDateTime = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const getStatusClasses = (status) => {
  if (status === 'approved') return 'bg-cargo-success/20 text-cargo-success';
  if (status === 'rejected') return 'bg-cargo-danger/20 text-cargo-danger';
  return 'bg-cargo-accent/20 text-cargo-accent';
};

const CashoutApprovalsPage = () => {
  const { get, put, loading } = useApi();
  const [status, setStatus] = useState('pending');
  const [driverRequests, setDriverRequests] = useState([]);
  const [helperRequests, setHelperRequests] = useState([]);
  const [submittingKey, setSubmittingKey] = useState(null);

  const fetchRequests = async (nextStatus = status) => {
    const params = nextStatus ? { status: nextStatus } : {};
    const [driverResult, helperResult] = await Promise.all([
      get('/admin/driver-cashout-requests', { params }),
      get('/admin/helper-cashout-requests', { params }),
    ]);

    if (driverResult.success) {
      setDriverRequests(driverResult.data.requests || []);
    } else {
      alert(driverResult.error);
    }

    if (helperResult.success) {
      setHelperRequests(helperResult.data.requests || []);
    } else {
      alert(helperResult.error);
    }
  };

  useEffect(() => {
    fetchRequests(status);
  }, [status]);

  const requests = useMemo(() => [
    ...driverRequests.map((request) => ({
      ...request,
      ownerType: 'driver',
      ownerName: request.driver_full_name || request.driver_username || `Driver #${request.driver_id}`,
      ownerMeta: request.car_number || 'No car',
    })),
    ...helperRequests.map((request) => ({
      ...request,
      ownerType: 'helper',
      ownerName: request.helper_name || `Helper #${request.helper_id}`,
      ownerMeta: `${request.driver_full_name || request.driver_username || 'No driver'} • ${request.car_number || 'No car'}`,
    })),
  ].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)), [driverRequests, helperRequests]);

  const handleStatusChange = async (request) => {
    const action = request.nextStatus;
    const requestType = request.ownerType;
    const requestId = request.id;
    const key = `${requestType}-${requestId}`;
    const endpoint = requestType === 'helper'
      ? `/admin/helper-cashout-requests/${requestId}/status`
      : `/admin/driver-cashout-requests/${requestId}/status`;

    setSubmittingKey(key);
    const result = await put(endpoint, { status: action });
    setSubmittingKey(null);

    if (!result.success) {
      alert(result.error);
      return;
    }

    fetchRequests(status);
  };

  const totalAmount = requests.reduce((sum, request) => sum + Number(request.amount || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-cargo-text">Cashout Approvals</h1>
          <p className="text-sm text-cargo-muted mt-1">Review driver and helper account cashout requests before balances are deducted.</p>
        </div>
        <div className="rounded-xl border border-cargo-border bg-cargo-card px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-cargo-muted">Total Amount</p>
          <p className="text-xl font-bold text-primary-300">{formatCurrency(totalAmount)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setStatus(tab)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium capitalize transition-colors ${
              status === tab
                ? 'border-primary-500 bg-primary-500/20 text-primary-300'
                : 'border-cargo-border bg-cargo-card text-cargo-muted hover:text-cargo-text'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
        </div>
      ) : requests.length ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {requests.map((request) => {
            const key = `${request.ownerType}-${request.id}`;
            const isSubmitting = submittingKey === key;
            return (
              <div key={key} className="rounded-xl border border-cargo-border bg-cargo-card p-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cargo-dark border border-cargo-border">
                      {request.ownerType === 'helper' ? <HandHelping className="h-5 w-5 text-primary-300" /> : <User className="h-5 w-5 text-primary-300" />}
                    </div>
                    <div>
                      <p className="font-semibold text-cargo-text">{request.ownerName}</p>
                      <p className="text-sm text-cargo-muted">{request.ownerMeta}</p>
                      <p className="text-xs text-cargo-muted mt-1 capitalize">{request.ownerType} • {request.balance_type || 'available'} • {request.receive_method}</p>
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs capitalize ${getStatusClasses(request.status)}`}>
                    {request.status}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div className="rounded-lg border border-cargo-border bg-cargo-dark/30 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-cargo-muted">Amount</p>
                    <p className="font-semibold text-cargo-text mt-1">{formatCurrency(request.amount)}</p>
                  </div>
                  <div className="rounded-lg border border-cargo-border bg-cargo-dark/30 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-cargo-muted">Created</p>
                    <p className="font-medium text-cargo-text mt-1">{formatDateTime(request.created_at)}</p>
                  </div>
                  <div className="rounded-lg border border-cargo-border bg-cargo-dark/30 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-cargo-muted">Reviewed</p>
                    <p className="font-medium text-cargo-text mt-1">{formatDateTime(request.reviewed_at)}</p>
                  </div>
                </div>

                {request.receive_method === 'account' ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                    <div className="rounded-lg border border-cargo-border bg-cargo-dark/30 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-cargo-muted">Account Name</p>
                      <p className="font-medium text-cargo-text mt-1">{request.account_name || 'N/A'}</p>
                    </div>
                    <div className="rounded-lg border border-cargo-border bg-cargo-dark/30 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-cargo-muted">Account Number</p>
                      <p className="font-medium text-cargo-text mt-1">{request.account_number || 'N/A'}</p>
                    </div>
                    <div className="rounded-lg border border-cargo-border bg-cargo-dark/30 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-cargo-muted">Bank</p>
                      <p className="font-medium text-cargo-text mt-1">{request.bank_name || 'N/A'}</p>
                    </div>
                  </div>
                ) : null}

                {request.status === 'pending' ? (
                  <div className="flex items-center gap-2 border-t border-cargo-border pt-4">
                    <button
                      type="button"
                      onClick={() => handleStatusChange({ ...request, nextStatus: 'approved' })}
                      disabled={isSubmitting}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-cargo-success/30 bg-cargo-success/10 px-3 py-2 text-sm font-medium text-cargo-success hover:bg-cargo-success/20 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusChange({ ...request, nextStatus: 'rejected' })}
                      disabled={isSubmitting}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-cargo-danger/30 bg-cargo-danger/10 px-3 py-2 text-sm font-medium text-cargo-danger hover:bg-cargo-danger/20 disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-cargo-border bg-cargo-card/30 p-10 text-center">
          {status === 'pending' ? <Clock className="w-10 h-10 text-cargo-muted mx-auto mb-3" /> : <Banknote className="w-10 h-10 text-cargo-muted mx-auto mb-3" />}
          <p className="text-cargo-text font-semibold">No {status} cashout requests</p>
          <p className="text-sm text-cargo-muted mt-1">Requests will appear here when drivers or helpers submit account cashouts.</p>
        </div>
      )}
    </div>
  );
};

export default CashoutApprovalsPage;
