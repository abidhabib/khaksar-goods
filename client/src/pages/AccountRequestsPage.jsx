import { useEffect, useState } from 'react';
import { CheckCircle2, Coins, HandCoins, Wallet, XCircle } from 'lucide-react';
import { useApi } from '../hooks/useApi';

const formatCurrency = (value) => `Rs ${Number(value || 0).toLocaleString()}`;
const tabs = [
  { key: 'commissions', label: 'Commission Requests', icon: Coins },
  { key: 'driverCashouts', label: 'Driver Cashouts', icon: Wallet },
  { key: 'helperCashouts', label: 'Helper Cashouts', icon: HandCoins },
];

const AccountRequestsPage = () => {
  const { get, put } = useApi();
  const [activeTab, setActiveTab] = useState('commissions');
  const [commissionRequests, setCommissionRequests] = useState([]);
  const [driverCashouts, setDriverCashouts] = useState([]);
  const [helperCashouts, setHelperCashouts] = useState([]);
  const [busyId, setBusyId] = useState(null);

  const loadAll = async () => {
    const [commissionResult, driverCashoutResult, helperCashoutResult] = await Promise.all([
      get('/admin/driver-commission-requests'),
      get('/admin/driver-cashout-requests'),
      get('/admin/helper-cashout-requests'),
    ]);

    if (commissionResult.success) setCommissionRequests(commissionResult.data.requests || []);
    if (driverCashoutResult.success) setDriverCashouts(driverCashoutResult.data.requests || []);
    if (helperCashoutResult.success) setHelperCashouts(helperCashoutResult.data.requests || []);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleStatusChange = async (type, id, status) => {
    setBusyId(`${type}-${id}`);
    const routeMap = {
      commissions: `/admin/driver-commission-requests/${id}/status`,
      driverCashouts: `/admin/driver-cashout-requests/${id}/status`,
      helperCashouts: `/admin/helper-cashout-requests/${id}/status`,
    };
    const result = await put(routeMap[type], { status });
    setBusyId(null);

    if (!result.success) {
      alert(result.error);
      return;
    }

    loadAll();
  };

  const dataMap = {
    commissions: commissionRequests,
    driverCashouts,
    helperCashouts,
  };

  const currentRows = dataMap[activeTab] || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-cargo-text">Driver & Helper Accounts</h1>
        <p className="text-cargo-muted mt-1">Approve commission requests and manage driver/helper cashout workflows from one place.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={activeTab === tab.key ? 'btn-primary flex items-center gap-2' : 'btn-secondary flex items-center gap-2'}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[1100px]">
          <thead>
            <tr className="border-b border-cargo-border text-left">
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Name</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Car</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Details</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Amount</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Status</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Created</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Action</th>
            </tr>
          </thead>
          <tbody>
            {currentRows.map((row) => {
              const pending = row.status === 'pending';
              const key = `${activeTab}-${row.id}`;
              return (
                <tr key={key} className="border-b border-cargo-border/60 align-top">
                  <td className="py-3 pr-4 text-sm text-cargo-text">
                    {activeTab === 'helperCashouts'
                      ? `${row.helper_name} / ${row.driver_full_name || row.driver_username}`
                      : row.driver_full_name || row.driver_username}
                  </td>
                  <td className="py-3 pr-4 text-sm text-cargo-text">{row.car_number || 'N/A'}</td>
                  <td className="py-3 pr-4 text-sm text-cargo-muted">
                    {activeTab === 'commissions'
                      ? `Trip #${row.trip_id} • ${row.commission_percentage}% • Net ${formatCurrency(row.net_profit)}`
                      : `${row.receive_method}${row.balance_type ? ` • ${row.balance_type}` : ''}${row.bank_name ? ` • ${row.bank_name}` : ''}`}
                  </td>
                  <td className="py-3 pr-4 text-sm font-semibold text-primary-400">
                    {activeTab === 'commissions' ? formatCurrency(row.commission_amount) : formatCurrency(row.amount)}
                  </td>
                  <td className="py-3 pr-4 text-sm capitalize text-cargo-text">{row.status}</td>
                  <td className="py-3 pr-4 text-sm text-cargo-muted">{new Date(row.created_at).toLocaleString()}</td>
                  <td className="py-3 pr-4 text-sm">
                    {pending ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleStatusChange(activeTab, row.id, 'approved')}
                          disabled={busyId === key}
                          className="inline-flex items-center gap-1 rounded-lg bg-cargo-success/15 px-3 py-2 text-cargo-success"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Approve
                        </button>
                        <button
                          onClick={() => handleStatusChange(activeTab, row.id, 'rejected')}
                          disabled={busyId === key}
                          className="inline-flex items-center gap-1 rounded-lg bg-cargo-danger/15 px-3 py-2 text-cargo-danger"
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
              );
            })}
            {!currentRows.length ? (
              <tr>
                <td colSpan="7" className="py-8 text-center text-cargo-muted">No rows found in this queue.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AccountRequestsPage;
