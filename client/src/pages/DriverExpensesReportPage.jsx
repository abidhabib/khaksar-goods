import { useEffect, useMemo, useState } from 'react';
import { FileText, Wallet, CalendarDays, Users } from 'lucide-react';
import { useApi } from '../hooks/useApi';

const formatCurrency = (value) => `Rs ${Number(value || 0).toLocaleString()}`;

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
    acc.cargo_service_cost += Number(row.cargo_service_cost || 0);
    acc.mobile_cost += Number(row.mobile_cost || 0);
    acc.moboil_change_cost += Number(row.moboil_change_cost || 0);
    acc.mechanic_cost += Number(row.mechanic_cost || 0);
    acc.food_cost += Number(row.food_cost || 0);
    acc.cargo_security_guard_fee += Number(row.cargo_security_guard_fee || 0);
    acc.other_cost += Number(row.other_cost || 0);
    return acc;
  }, {
    cargo_service_cost: 0,
    mobile_cost: 0,
    moboil_change_cost: 0,
    mechanic_cost: 0,
    food_cost: 0,
    cargo_security_guard_fee: 0,
    other_cost: 0,
  }), [rows]);

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
                <p className="text-sm text-cargo-muted mt-3">{item.total_days} day entries</p>
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
          <div className="rounded-lg border border-cargo-border p-3"><p className="text-xs text-cargo-muted">Cargo Service</p><p className="text-sm text-cargo-text mt-1">{formatCurrency(categoryTotals.cargo_service_cost)}</p></div>
          <div className="rounded-lg border border-cargo-border p-3"><p className="text-xs text-cargo-muted">Mobile</p><p className="text-sm text-cargo-text mt-1">{formatCurrency(categoryTotals.mobile_cost)}</p></div>
          <div className="rounded-lg border border-cargo-border p-3"><p className="text-xs text-cargo-muted">Moboil Change</p><p className="text-sm text-cargo-text mt-1">{formatCurrency(categoryTotals.moboil_change_cost)}</p></div>
          <div className="rounded-lg border border-cargo-border p-3"><p className="text-xs text-cargo-muted">Mechanic</p><p className="text-sm text-cargo-text mt-1">{formatCurrency(categoryTotals.mechanic_cost)}</p></div>
          <div className="rounded-lg border border-cargo-border p-3"><p className="text-xs text-cargo-muted">Food</p><p className="text-sm text-cargo-text mt-1">{formatCurrency(categoryTotals.food_cost)}</p></div>
          <div className="rounded-lg border border-cargo-border p-3"><p className="text-xs text-cargo-muted">Security Guard</p><p className="text-sm text-cargo-text mt-1">{formatCurrency(categoryTotals.cargo_security_guard_fee)}</p></div>
          <div className="rounded-lg border border-cargo-border p-3"><p className="text-xs text-cargo-muted">Other</p><p className="text-sm text-cargo-text mt-1">{formatCurrency(categoryTotals.other_cost)}</p></div>
        </div>
      </div>

      <div className="card space-y-4 overflow-x-auto">
        <div>
          <h2 className="text-lg font-semibold text-cargo-text">Expense History</h2>
          <p className="text-cargo-muted text-sm mt-1">Every saved daily expense row for the selected driver/month</p>
        </div>
        <table className="w-full min-w-[1200px]">
          <thead>
            <tr className="border-b border-cargo-border text-left">
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Date</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Driver</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Cargo</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Cargo Service</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Mobile</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Moboil</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Mechanic</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Food</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Security Guard</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Other</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Total</th>
              <th className="py-3 text-xs uppercase tracking-wide text-cargo-muted">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row) => (
              <tr key={row.id} className="border-b border-cargo-border/60">
                <td className="py-3 pr-4 text-sm text-cargo-text">{row.expense_date?.slice(0, 10)}</td>
                <td className="py-3 pr-4 text-sm text-cargo-text">{row.driver_name}</td>
                <td className="py-3 pr-4 text-sm text-cargo-text">{row.car_number || 'N/A'}</td>
                <td className="py-3 pr-4 text-sm text-cargo-text">{formatCurrency(row.cargo_service_cost)}</td>
                <td className="py-3 pr-4 text-sm text-cargo-text">{formatCurrency(row.mobile_cost)}</td>
                <td className="py-3 pr-4 text-sm text-cargo-text">{formatCurrency(row.moboil_change_cost)}</td>
                <td className="py-3 pr-4 text-sm text-cargo-text">{formatCurrency(row.mechanic_cost)}</td>
                <td className="py-3 pr-4 text-sm text-cargo-text">{formatCurrency(row.food_cost)}</td>
                <td className="py-3 pr-4 text-sm text-cargo-text">{formatCurrency(row.cargo_security_guard_fee)}</td>
                <td className="py-3 pr-4 text-sm text-cargo-text">{formatCurrency(row.other_cost)}</td>
                <td className="py-3 pr-4 text-sm font-semibold text-primary-400">{formatCurrency(row.total_amount)}</td>
                <td className="py-3 text-sm text-cargo-muted whitespace-pre-wrap">{row.notes || '-'}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan="12" className="py-6 text-center text-cargo-muted">No rows found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DriverExpensesReportPage;
