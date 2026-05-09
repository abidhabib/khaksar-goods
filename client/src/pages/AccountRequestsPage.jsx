import { useEffect, useState } from 'react';
import { CheckCircle2, Coins, HandCoins, Pencil, Wallet, XCircle } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import Modal from '../components/common/Modal';

const formatCurrency = (value) => `Rs ${Number(value || 0).toLocaleString()}`;
const formatVariancePercent = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 'N/A';
  }

  return `${numericValue > 0 ? '+' : ''}${numericValue.toFixed(2)}%`;
};
const bankOptions = ['Easypaisa', 'JazzCash', 'HBL', 'OTHER'];
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
  const [editingRequest, setEditingRequest] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);

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

  const openEditModal = (type, row) => {
    setEditingRequest({ type, row });
    if (type === 'commissions') {
      setEditForm({
        commission_percentage: row.commission_percentage ?? '',
        net_profit: row.net_profit ?? '',
        commission_amount: row.commission_amount ?? '',
        remarks: row.remarks || '',
      });
      return;
    }

    setEditForm({
      balance_type: row.balance_type || 'available',
      amount: row.amount ?? '',
      receive_method: row.receive_method || 'cash',
      account_number: row.account_number || '',
      account_name: row.account_name || '',
      bank_name: row.bank_name || 'Easypaisa',
      remarks: row.remarks || '',
    });
  };

  const closeEditModal = () => {
    setEditingRequest(null);
    setEditForm({});
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    if (!editingRequest) return;

    const routeMap = {
      commissions: `/admin/driver-commission-requests/${editingRequest.row.id}`,
      driverCashouts: `/admin/driver-cashout-requests/${editingRequest.row.id}`,
      helperCashouts: `/admin/helper-cashout-requests/${editingRequest.row.id}`,
    };

    setSavingEdit(true);
    const result = await put(routeMap[editingRequest.type], editForm);
    setSavingEdit(false);

    if (!result.success) {
      alert(result.error);
      return;
    }

    closeEditModal();
    loadAll();
  };

  const dataMap = {
    commissions: commissionRequests,
    driverCashouts,
    helperCashouts,
  };

  const currentRows = dataMap[activeTab] || [];
  const showAccountFields = editingRequest?.type && editingRequest.type !== 'commissions' && editForm.receive_method === 'account';

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-cargo-text">Driver & Helper and Commission</h1>
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
          <table className="w-full min-w-[1320px]">
            <thead>
              <tr className="border-b border-cargo-border text-left">
                <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Name</th>
                <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Car</th>
                <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Details</th>
                <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Amount</th>
                <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Freight</th>
                <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Rent Up/Down %</th>
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
                    <td className="py-3 pr-4 text-sm text-cargo-text">
                      {activeTab === 'commissions' ? formatCurrency(row.freight_charge) : 'N/A'}
                    </td>
                    <td className={`py-3 pr-4 text-sm font-semibold ${row.freight_variance_direction === 'up' ? 'text-cargo-success' : row.freight_variance_direction === 'down' ? 'text-cargo-danger' : 'text-cargo-muted'}`}>
                      {activeTab === 'commissions' ? formatVariancePercent(row.freight_variance_percentage) : 'N/A'}
                    </td>
                    <td className="py-3 pr-4 text-sm capitalize text-cargo-text">{row.status}</td>
                    <td className="py-3 pr-4 text-sm text-cargo-muted">{new Date(row.created_at).toLocaleString()}</td>
                    <td className="py-3 pr-4 text-sm">
                      {pending ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => openEditModal(activeTab, row)}
                            disabled={busyId === key}
                            className="inline-flex items-center gap-1 rounded-lg bg-primary-500/15 px-3 py-2 text-primary-300"
                          >
                            <Pencil className="w-4 h-4" />
                            Edit
                          </button>
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
                  <td colSpan="9" className="py-8 text-center text-cargo-muted">No rows found in this queue.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={Boolean(editingRequest)}
        onClose={closeEditModal}
        title={`Edit ${editingRequest?.type === 'commissions' ? 'Commission Request' : editingRequest?.type === 'driverCashouts' ? 'Driver Cashout' : 'Helper Cashout'}`}
      >
        <form onSubmit={handleEditSave} className="space-y-4">
          {editingRequest?.type === 'commissions' ? (
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
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {editingRequest?.type === 'driverCashouts' ? (
                <select
                  value={editForm.balance_type || 'available'}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, balance_type: e.target.value }))}
                  className="input-field w-full"
                >
                  <option value="available">Available Balance</option>
                  <option value="commission">Commission Balance</option>
                </select>
              ) : null}
              <input
                type="number"
                min="0"
                step="0.01"
                value={editForm.amount || ''}
                onChange={(e) => setEditForm((prev) => ({ ...prev, amount: e.target.value }))}
                className="input-field w-full"
                placeholder="Amount"
              />
              <select
                value={editForm.receive_method || 'cash'}
                onChange={(e) => setEditForm((prev) => ({ ...prev, receive_method: e.target.value }))}
                className="input-field w-full"
              >
                <option value="cash">Cash</option>
                <option value="account">Account</option>
              </select>
              {showAccountFields ? (
                <>
                  <input
                    type="text"
                    value={editForm.account_number || ''}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, account_number: e.target.value }))}
                    className="input-field w-full"
                    placeholder="Account Number"
                  />
                  <input
                    type="text"
                    value={editForm.account_name || ''}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, account_name: e.target.value }))}
                    className="input-field w-full"
                    placeholder="Account Name"
                  />
                  <select
                    value={editForm.bank_name || 'Easypaisa'}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, bank_name: e.target.value }))}
                    className="input-field w-full md:col-span-2"
                  >
                    {bankOptions.map((bank) => (
                      <option key={bank} value={bank}>{bank}</option>
                    ))}
                  </select>
                </>
              ) : null}
            </div>
          )}

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
