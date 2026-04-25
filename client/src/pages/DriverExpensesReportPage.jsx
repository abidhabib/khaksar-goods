import { useEffect, useMemo, useState } from 'react';
import { FileText, Wallet, CalendarDays, Users } from 'lucide-react';
import { useApi } from '../hooks/useApi';

const formatCurrency = (value) => `Rs ${Number(value || 0).toLocaleString()}`;
const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const getCategoryLabel = (category) => ({
  cargo_service: 'Cargo Service',
  mobile: 'Mobile Cost',
  moboil_change: 'Moboil Change',
  mechanic: 'Mechanic Cost',
  food: 'Food Cost',
  cargo_security_guard: 'Security Guard Fee',
}[category] || category);

const DriverExpensesReportPage = () => {
  const { get, loading } = useApi();
  const [drivers, setDrivers] = useState([]);
  const [reportData, setReportData] = useState({ rows: [], driverTotals: [], summary: {} });
  const [filters, setFilters] = useState({
    month: new Date().toISOString().slice(0, 7),
    driver_id: '',
  });

  const fetchDrivers = async () => {
    const result = await get('/admin/drivers');
    if (result.success) {
      setDrivers(result.data.drivers || []);
    }
  };

  const fetchReport = async (activeFilters = filters) => {
    const params = {};
    if (activeFilters.month) {
      params.month = activeFilters.month;
    }
    if (activeFilters.driver_id) {
      params.driver_id = activeFilters.driver_id;
    }

    const result = await get('/admin/drivers-expenses', { params });
    if (result.success) {
      setReportData(result.data);
    } else {
      alert(result.error);
    }
  };

  useEffect(() => {
    fetchDrivers();
    fetchReport(filters);
  }, []);

  const rows = reportData?.rows || [];
  const driverTotals = reportData?.driverTotals || [];

  const categoryTotals = useMemo(() => rows.reduce((acc, row) => {
    const category = row.category;
    acc[category] = (acc[category] || 0) + Number(row.amount || 0);
    return acc;
  }, {}), [rows]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-cargo-border bg-gradient-to-r from-cargo-card to-cargo-dark p-5">
        <h1 className="text-2xl font-bold text-cargo-text flex items-center gap-2">
          <FileText className="w-6 h-6 text-primary-400" />
          Drivers Expenses
        </h1>
        <p className="text-cargo-muted mt-1">Daily driver expense history with monthly filtering and totals</p>
      </div>

      <div className="card grid grid-cols-1 md:grid-cols-3 gap-3">
        <input
          type="month"
          value={filters.month}
          onChange={(e) => setFilters((prev) => ({ ...prev, month: e.target.value }))}
          className="input-field w-full"
        />
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
        <button type="button" onClick={() => fetchReport(filters)} className="btn-primary">
          Apply Filter
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-sm text-cargo-muted flex items-center gap-2"><Wallet className="w-4 h-4" />Total Amount</p>
          <p className="text-2xl font-bold text-cargo-text mt-1">{formatCurrency(reportData?.summary?.total_amount)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-cargo-muted flex items-center gap-2"><CalendarDays className="w-4 h-4" />Expense Entries</p>
          <p className="text-2xl font-bold text-cargo-text mt-1">{reportData?.summary?.total_entries || 0}</p>
        </div>
        <div className="card">
          <p className="text-sm text-cargo-muted flex items-center gap-2"><Users className="w-4 h-4" />Drivers Covered</p>
          <p className="text-2xl font-bold text-cargo-text mt-1">{reportData?.summary?.total_drivers || 0}</p>
        </div>
      </div>

      <div className="card space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-cargo-text">Driver Totals</h2>
          <p className="text-cargo-muted text-sm mt-1">Month-wise totals grouped by driver</p>
        </div>
        {loading && !driverTotals.length ? (
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
        ) : driverTotals.length ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {driverTotals.map((item) => (
              <div key={item.driver_id} className="rounded-xl border border-cargo-border bg-cargo-dark/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-cargo-text font-semibold">{item.driver_name}</p>
                    <p className="text-sm text-cargo-muted mt-1">{item.car_number || 'No cargo assigned'} • {item.driver_phone || 'No phone'}</p>
                  </div>
                  <span className="text-primary-400 font-semibold">{formatCurrency(item.total_amount)}</span>
                </div>
                    <p className="text-sm text-cargo-muted mt-3">{item.total_entries} saved entries across {item.total_days} days</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-cargo-muted">No daily expense records found for this filter.</p>
        )}
      </div>

      <div className="card space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-cargo-text">Category Totals</h2>
          <p className="text-cargo-muted text-sm mt-1">All daily expense categories in the selected period</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="rounded-lg border border-cargo-border p-3"><p className="text-xs text-cargo-muted">Cargo Service</p><p className="text-sm text-cargo-text mt-1">{formatCurrency(categoryTotals.cargo_service)}</p></div>
          <div className="rounded-lg border border-cargo-border p-3"><p className="text-xs text-cargo-muted">Mobile</p><p className="text-sm text-cargo-text mt-1">{formatCurrency(categoryTotals.mobile)}</p></div>
          <div className="rounded-lg border border-cargo-border p-3"><p className="text-xs text-cargo-muted">Moboil Change</p><p className="text-sm text-cargo-text mt-1">{formatCurrency(categoryTotals.moboil_change)}</p></div>
          <div className="rounded-lg border border-cargo-border p-3"><p className="text-xs text-cargo-muted">Mechanic</p><p className="text-sm text-cargo-text mt-1">{formatCurrency(categoryTotals.mechanic)}</p></div>
          <div className="rounded-lg border border-cargo-border p-3"><p className="text-xs text-cargo-muted">Food</p><p className="text-sm text-cargo-text mt-1">{formatCurrency(categoryTotals.food)}</p></div>
          <div className="rounded-lg border border-cargo-border p-3"><p className="text-xs text-cargo-muted">Security Guard</p><p className="text-sm text-cargo-text mt-1">{formatCurrency(categoryTotals.cargo_security_guard)}</p></div>
        </div>
      </div>

      <div className="card space-y-4 overflow-x-auto">
        <div>
          <h2 className="text-lg font-semibold text-cargo-text">Expense History</h2>
          <p className="text-cargo-muted text-sm mt-1">Every saved daily expense entry with separate time tracking</p>
        </div>
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="border-b border-cargo-border text-left">
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Saved At</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Driver</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Cargo</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Date</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Category</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row) => (
              <tr key={row.id} className="border-b border-cargo-border/60">
                <td className="py-3 pr-4 text-sm text-cargo-text">{formatDateTime(row.created_at)}</td>
                <td className="py-3 pr-4 text-sm text-cargo-text">{row.driver_name}</td>
                <td className="py-3 pr-4 text-sm text-cargo-text">{row.car_number || 'N/A'}</td>
                <td className="py-3 pr-4 text-sm text-cargo-text">{row.expense_date?.slice(0, 10)}</td>
                <td className="py-3 pr-4 text-sm text-cargo-text">{getCategoryLabel(row.category)}</td>
                <td className="py-3 pr-4 text-sm font-semibold text-primary-400">{formatCurrency(row.amount)}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan="5" className="py-6 text-center text-cargo-muted">No rows found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DriverExpensesReportPage;
