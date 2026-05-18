import { useEffect, useMemo, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpRight,
  User,
  Car,
  Phone,
  IdCard,
  Filter,
  Clock3,
  CheckCircle2,
  MapPin,
  Wallet,
  Calendar,
  Gauge,
  FileText,
  X,
  ZoomIn,
  Receipt,
  Route,
  TrendingUp,
  TrendingDown,
  Activity,
  Pencil,
  Plus,
} from 'lucide-react';
import { useApi } from '../hooks/useApi';
import Modal from '../components/common/Modal';

const formatCurrency = (value) => `Rs ${Number(value || 0).toLocaleString()}`;


const formatAverage = (value) => {
  const numericValue = Number(value || 0);
  return numericValue > 0 ? `${numericValue.toFixed(2)} km/L` : 'N/A';
};






const SummaryCard = ({ title, value, icon, highlight = false }) => {
  const IconComponent = icon;

  return (
    <div className={`card group hover:border-cargo-border/80 transition-all duration-200 ${highlight ? 'border-cargo-success/30' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-cargo-muted font-medium">{title}</p>
          <p className={`text-xl font-bold mt-1 ${highlight ? 'text-cargo-success' : 'text-cargo-text'}`}>{value}</p>
        </div>
          <div className={`p-2 rounded-lg ${highlight ? 'bg-cargo-success/10' : 'bg-cargo-dark/30'}`}>
          <IconComponent className={`w-5 h-5 ${highlight ? 'text-cargo-success' : title === 'Total Taken' ? 'text-cargo-danger' : 'text-cargo-muted'}`} />
        </div>
      </div>
    </div>
  );
};

const DriverReportPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { get, post, put, loading } = useApi();
  const [reportData, setReportData] = useState(null);
  const [filters, setFilters] = useState({
    period: 'all',
    from_date: '',
    to_date: '',
  });



  const fetchReport = useCallback(async (activeFilters = filters) => {
    const params = { period: activeFilters.period };

    if (activeFilters.from_date) {
      params.from_date = activeFilters.from_date;
    }

    if (activeFilters.to_date) {
      params.to_date = activeFilters.to_date;
    }

    const result = await get(`/admin/drivers/${id}/report`, { params });

    if (result.success) {
      setReportData(result.data);
    } else {
      alert(result.error);
    }
  }, [get, id, filters]);

  useEffect(() => {
    fetchReport({ period: 'all', from_date: '', to_date: '' });
  }, [id, fetchReport]);

  const allTrips = reportData?.trips || [];

  const ongoingTrips = useMemo(
    () => allTrips.filter((trip) => trip.status === 'ongoing'),
    [allTrips]
  );

  const completedTrips = useMemo(
    () => allTrips.filter((trip) => trip.status === 'completed'),
    [allTrips]
  );

  const fallbackCurrentTrip = reportData?.currentTrip ? [reportData.currentTrip] : [];
  const ongoingToRender = ongoingTrips.length ? ongoingTrips : fallbackCurrentTrip;

  

  


  return (
    <div className="space-y-6 pb-10 max-w-7xl">
      {/* Header */}
      <div className="rounded-xl border border-cargo-border bg-gradient-to-r from-cargo-card to-cargo-dark p-5 md:p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate('/drivers')}
            className="btn-secondary flex items-center gap-2 hover:bg-cargo-dark/50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div>
            <h1 className="text-2xl font-bold text-cargo-text flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary-500/10">
                <User className="w-6 h-6 text-primary-400" />
              </div>
              Driver Report {reportData?.driver?.username ? `- ${reportData.driver.username}` : ''}
            </h1>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="md:col-span-2 flex items-center gap-2">
          <Filter className="w-4 h-4 text-cargo-muted" />
          <select
            value={filters.period}
            onChange={(e) => setFilters((prev) => ({ ...prev, period: e.target.value }))}
            className="input-field w-full"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">Last 7 Days</option>
            <option value="month">Last 30 Days</option>
            <option value="year">Last 12 Months</option>
          </select>
        </div>
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
        <button type="button" onClick={() => fetchReport(filters)} className="btn-primary md:col-span-4">
          Apply Filter
        </button>
      </div>

      {loading && !reportData ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            <SummaryCard
              title="Challan Amount "
              value={`${formatCurrency(reportData?.stats?.total_challan_amount)} / ${reportData?.stats?.challan_count || 0}`}
              icon={Receipt}
            />
            <SummaryCard title="Food Expenses" value={formatCurrency(reportData?.stats?.total_food_expenses)} icon={TrendingDown} />
            <SummaryCard title="Average" value={formatAverage(reportData?.stats?.overall_average_km_per_liter)} icon={Activity} />
            <SummaryCard title="Karay Liye" value={formatCurrency(reportData?.stats?.total_freight_taken)} icon={TrendingUp} />
            <SummaryCard title="Available Salary" value={formatCurrency(reportData?.driver?.available_balance)} icon={Wallet} />
            <SummaryCard title="Commission Taken" value={formatCurrency(reportData?.stats?.total_taken)} icon={ArrowUpRight} />
            <SummaryCard title="Bilty Commission" value={formatCurrency(reportData?.stats?.total_bilty_commission)} icon={Wallet} />
            <SummaryCard title="Income Given" value={formatCurrency(reportData?.stats?.net_profit)} icon={Wallet} highlight />
            <SummaryCard title="Commission Balance" value={formatCurrency(reportData?.driver?.commission_balance)} icon={Wallet} />
            <SummaryCard
              title="Trips / Distance"
              value={`${reportData?.stats?.total_trips || 0} / ${(reportData?.stats?.total_distance || 0).toLocaleString()} km`}
              icon={Activity}
            />
          </div>

          {/* Driver Details + Trip Status */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="card lg:col-span-2">
              <h2 className="text-lg font-semibold text-cargo-text mb-4 flex items-center gap-2">
                <IdCard className="w-5 h-5 text-cargo-muted" />
                Driver Details
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  { label: 'Phone', value: reportData?.driver?.phone || 'N/A', icon: Phone },
                  { label: 'License', value: reportData?.driver?.license_number || 'License N/A', icon: IdCard },
                  { label: 'Driver Cargo Number', value: reportData?.driver?.car_number || 'No cargo assigned', icon: Car },
                  { label: 'Overall Avg', value: formatAverage(reportData?.driver?.overall_average_km_per_liter || reportData?.stats?.overall_average_km_per_liter), icon: Activity },
                  { label: 'Status', value: reportData?.driver?.status ? reportData.driver.status.charAt(0).toUpperCase() + reportData.driver.status.slice(1) : 'N/A', icon: User },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-cargo-border bg-cargo-dark/20 p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-cargo-dark/30">
                      <item.icon className="w-4 h-4 text-cargo-muted" />
                    </div>
                    <div>
                      <p className="text-[11px] text-cargo-muted uppercase tracking-wider font-medium">{item.label}</p>
                      <p className="text-cargo-text font-semibold mt-0.5">{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h2 className="text-lg font-semibold text-cargo-text mb-4 flex items-center gap-2">
                <Activity className="w-5 h-5 text-cargo-muted" />
                Trip Status
              </h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-cargo-accent/20 bg-cargo-accent/5 p-4">
                  <div className="flex items-center gap-2.5 text-cargo-accent">
                    <Clock3 className="w-5 h-5" />
                    <span className="text-sm font-medium">Ongoing</span>
                  </div>
                  <span className="text-cargo-text font-bold text-lg">{ongoingToRender.length || reportData?.stats?.ongoing_trips || 0}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-cargo-success/20 bg-cargo-success/5 p-4">
                  <div className="flex items-center gap-2.5 text-cargo-success">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="text-sm font-medium">Completed</span>
                  </div>
                  <span className="text-cargo-text font-bold text-lg">{completedTrips.length || reportData?.stats?.completed_trips || 0}</span>
                </div>
              </div>
            </div>
          </div>

        
     
        </>
      )}

    </div>
  );
};

export default DriverReportPage;
