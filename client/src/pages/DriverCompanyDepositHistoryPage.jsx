import { useEffect, useState } from 'react';
import { ArrowLeft, Landmark } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi';

const formatCurrency = (value) => `Rs ${Number(value || 0).toLocaleString()}`;

const DriverCompanyDepositHistoryPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { get, loading } = useApi();
  const [adjustments, setAdjustments] = useState([]);
  const [summary, setSummary] = useState({ total_deposits: 0 });

  const driverName = location.state?.driverName || `Driver #${id}`;
  const driverUsername = location.state?.driverUsername || '';

  useEffect(() => {
    const fetchHistory = async () => {
      const result = await get('/admin/driver-company-balance-adjustments', { params: { driver_id: id } });
      if (result.success) {
        setAdjustments(result.data.adjustments || []);
        setSummary(result.data.summary || { total_deposits: 0 });
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
            <h1 className="text-2xl font-bold text-cargo-text">Company Deposit History</h1>
            <p className="text-sm text-cargo-muted mt-1">
              {driverName}{driverUsername ? ` • @${driverUsername}` : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-cargo-border bg-cargo-card p-4">
          <p className="text-sm text-cargo-muted">Total Deposited</p>
          <p className="text-2xl font-bold text-primary-300 mt-2">{formatCurrency(summary.total_deposits)}</p>
        </div>
        <div className="rounded-xl border border-cargo-border bg-cargo-card p-4">
          <p className="text-sm text-cargo-muted">Deposit Entries</p>
          <p className="text-2xl font-bold text-cargo-text mt-2">{adjustments.length}</p>
        </div>
        <div className="rounded-xl border border-cargo-border bg-cargo-card p-4">
          <p className="text-sm text-cargo-muted">Latest Deposit</p>
          <p className="text-2xl font-bold text-cargo-success mt-2">
            {adjustments[0] ? formatCurrency(adjustments[0].amount) : formatCurrency(0)}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : adjustments.length ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {adjustments.map((adjustment) => (
            <div key={adjustment.id} className="rounded-xl border border-cargo-border bg-cargo-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-cargo-text">{formatCurrency(adjustment.amount)}</p>
                  <p className="text-sm text-cargo-muted mt-1 capitalize">{adjustment.adjustment_type}</p>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-primary-600/15 text-primary-300 capitalize">
                  {adjustment.adjustment_type}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-cargo-border bg-cargo-dark/30 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-cargo-muted">Created</p>
                  <p className="text-cargo-text font-medium mt-1">{adjustment.created_at ? new Date(adjustment.created_at).toLocaleString() : 'N/A'}</p>
                </div>
                <div className="rounded-lg border border-cargo-border bg-cargo-dark/30 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-cargo-muted">Created By</p>
                  <p className="text-cargo-text font-medium mt-1">{adjustment.created_by_username || 'N/A'}</p>
                </div>
              </div>

              {adjustment.remarks ? (
                <div className="rounded-lg border border-cargo-border bg-cargo-dark/30 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-cargo-muted">Remarks</p>
                  <p className="text-cargo-text text-sm mt-1">{adjustment.remarks}</p>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-cargo-border bg-cargo-card/30 p-10 text-center">
          <Landmark className="w-10 h-10 text-cargo-muted mx-auto mb-3" />
          <p className="text-cargo-text font-semibold">No deposit history found</p>
          <p className="text-sm text-cargo-muted mt-1">This driver has no admin company balance deposits yet.</p>
        </div>
      )}
    </div>
  );
};

export default DriverCompanyDepositHistoryPage;
