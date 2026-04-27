import { useEffect, useMemo, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Car,
  Calendar,
  Filter,
  User,
  Clock3,
  CheckCircle2,
  MapPin,
  Wallet,
  Gauge,
  FileText,
  X,
  ZoomIn,
  Receipt,
  Route,
  TrendingUp,
  TrendingDown,
  Activity,
} from 'lucide-react';
import { useApi } from '../hooks/useApi';

const formatCurrency = (value) => `Rs ${Number(value || 0).toLocaleString()}`;

const formatDate = (value, pattern = 'PPP p') => {
  if (!value) {
    return 'N/A';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'N/A';
  }

  return format(date, pattern);
};

const formatCategoryLabel = (value) =>
  String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

/* ─── Image Modal ─── */
const ImageModal = ({ src, alt, isOpen, onClose }) => {
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen || !src) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative max-w-5xl w-[90vw] max-h-[90vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-contain rounded-lg shadow-2xl border border-white/10"
        />
        {alt && (
          <p className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-sm px-4 py-2 rounded-b-lg backdrop-blur-sm">
            {alt}
          </p>
        )}
      </div>
    </div>
  );
};

/* ─── Clickable Image Card ─── */
const ClickableImage = ({ src, alt, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!src) {
    return (
      <div className={`rounded-lg border border-dashed border-cargo-border flex items-center justify-center text-xs text-cargo-muted bg-cargo-dark/20 ${className}`}>
        No image
      </div>
    );
  }

  return (
    <>
      <div
        className={`relative group cursor-pointer overflow-hidden rounded-lg border border-cargo-border ${className}`}
        onClick={() => setIsOpen(true)}
      >
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200 flex items-center justify-center">
          <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 drop-shadow-lg" />
        </div>
      </div>
      <ImageModal src={src} alt={alt} isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
};

const MeterImageCard = ({ label, src, alt }) => (
  <div>
    <p className="text-xs text-cargo-muted mb-2 font-medium tracking-wide uppercase">{label}</p>
    <ClickableImage src={src} alt={alt} className="h-36" />
  </div>
);

const ExpenseBreakdown = ({ trip }) => {
  const expenses = trip.expenses || [];

  return (
    <div className="rounded-xl border border-cargo-border bg-cargo-dark/30 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-cargo-text font-semibold flex items-center gap-2">
          <Receipt className="w-4 h-4 text-cargo-muted" />
          Expense Breakdown
        </p>
        <p className="text-sm text-cargo-muted font-medium">Total: {formatCurrency(trip.total_expenses)}</p>
      </div>

      {expenses.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {expenses.map((expense) => (
            <div
              key={expense.id}
              className="rounded-lg border border-cargo-border/60 bg-cargo-card/40 p-3 hover:border-cargo-border transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-cargo-accent/60" />
                  <p className="text-sm text-cargo-text font-medium">{formatCategoryLabel(expense.category)}</p>
                </div>
                <p className="text-sm text-cargo-text font-semibold">{formatCurrency(expense.amount)}</p>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-cargo-muted">
                <span>{formatDate(expense.created_at)}</span>
                {expense.liters ? <span>Liters: {Number(expense.liters).toLocaleString()}</span> : null}
                {expense.location ? <span>Location: {expense.location}</span> : null}
              </div>
              {expense.receipt_image ? (
                <div className="mt-3">
                  <ClickableImage
                    src={expense.receipt_image}
                    alt={`${expense.category} receipt`}
                    className="h-28"
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-cargo-muted">No expense entries on this trip.</p>
      )}
    </div>
  );
};

const StatBadge = ({ children, variant = 'default' }) => {
  const variants = {
    ongoing: 'bg-cargo-accent/15 text-cargo-accent border-cargo-accent/20',
    completed: 'bg-cargo-success/15 text-cargo-success border-cargo-success/20',
    default: 'bg-cargo-dark/40 text-cargo-muted border-cargo-border/60',
  };

  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border ${variants[variant]}`}>
      {children}
    </span>
  );
};

const TripCard = ({ trip, status = 'completed' }) => {
  const isOngoing = status === 'ongoing';
  const actualEndLocation = trip.end_location || trip.end_live_location;
  const loadSummary = [trip.load_name, trip.load_weight].filter(Boolean).join(' • ');

  return (
    <article className="rounded-xl border border-cargo-border bg-cargo-card/50 p-5 space-y-5 hover:border-cargo-border/80 transition-all duration-200 shadow-sm">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={`mt-1 p-2 rounded-lg ${isOngoing ? 'bg-cargo-accent/10' : 'bg-cargo-success/10'}`}>
            <Route className={`w-4 h-4 ${isOngoing ? 'text-cargo-accent' : 'text-cargo-success'}`} />
          </div>
          <div>
            <p className="text-cargo-text font-bold text-base">
              {trip.from_location} <span className="text-cargo-muted font-normal mx-1">→</span> {trip.to_location}
            </p>
            <p className="text-xs text-cargo-muted mt-1 flex items-center gap-1">
              <User className="w-3 h-3" />
              Driver: {trip.driver_name || 'N/A'}
            </p>
          </div>
        </div>
        <StatBadge variant={isOngoing ? 'ongoing' : 'completed'}>
          {isOngoing ? 'Ongoing' : 'Completed'}
        </StatBadge>
      </div>

      {/* Primary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Started', value: formatDate(trip.started_at), icon: Calendar },
          { label: 'Ended', value: isOngoing ? 'In progress' : formatDate(trip.ended_at), icon: Clock3 },
          { label: 'Freight', value: formatCurrency(trip.freight_charge), icon: Wallet },
          { label: 'Expenses', value: formatCurrency(trip.total_expenses), icon: TrendingDown },
          { label: 'Net', value: formatCurrency(trip.net_income), icon: TrendingUp, highlight: true },
          { label: 'Distance', value: `${Math.max((trip.end_meter_reading || 0) - (trip.start_meter_reading || 0), 0).toLocaleString()} km`, icon: Activity },
        ].map((item) => (
          <div
            key={item.label}
            className={`rounded-lg border p-3 ${item.highlight ? 'border-cargo-success/30 bg-cargo-success/5' : 'border-cargo-border bg-cargo-dark/20'}`}
          >
            <p className="text-[11px] text-cargo-muted uppercase tracking-wider font-medium flex items-center gap-1">
              <item.icon className="w-3 h-3" />
              {item.label}
            </p>
            <p className={`text-sm font-semibold mt-1.5 ${item.highlight ? 'text-cargo-success' : 'text-cargo-text'}`}>
              {item.value}
            </p>
          </div>
        ))}
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/20 p-3">
          <p className="text-[11px] text-cargo-muted uppercase tracking-wider font-medium flex items-center gap-1">
            <Gauge className="w-3 h-3" />Start Meter
          </p>
          <p className="text-sm text-cargo-text font-semibold mt-1.5">{(trip.start_meter_reading || 0).toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/20 p-3">
          <p className="text-[11px] text-cargo-muted uppercase tracking-wider font-medium flex items-center gap-1">
            <Gauge className="w-3 h-3" />End Meter
          </p>
          <p className="text-sm text-cargo-text font-semibold mt-1.5">
            {trip.end_meter_reading ? trip.end_meter_reading.toLocaleString() : isOngoing ? 'Pending' : 'N/A'}
          </p>
        </div>
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/20 p-3">
          <p className="text-[11px] text-cargo-muted uppercase tracking-wider font-medium flex items-center gap-1">
            <MapPin className="w-3 h-3" />Live Start
          </p>
          <p className="text-sm text-cargo-text font-semibold mt-1.5">{trip.start_live_location || trip.from_location || 'N/A'}</p>
        </div>
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/20 p-3">
          <p className="text-[11px] text-cargo-muted uppercase tracking-wider font-medium flex items-center gap-1">
            <MapPin className="w-3 h-3" />Actual End
          </p>
          <p className="text-sm text-cargo-text font-semibold mt-1.5">{actualEndLocation || (isOngoing ? 'In progress' : 'N/A')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/20 p-3">
          <p className="text-[11px] text-cargo-muted uppercase tracking-wider font-medium">Load Details</p>
          <p className="text-sm text-cargo-text font-semibold mt-1.5">{loadSummary || 'N/A'}</p>
        </div>
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/20 p-3">
          <p className="text-[11px] text-cargo-muted uppercase tracking-wider font-medium">Load Photo</p>
          <div className="mt-2">
            <ClickableImage src={trip.load_photo} alt="Load photo" className="h-28" />
          </div>
        </div>
      </div>

      {/* Images */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MeterImageCard label="Start Meter Photo" src={trip.start_meter_image} alt="Start meter" />
        <MeterImageCard label="End Meter Photo" src={trip.end_meter_image} alt="End meter" />
        <MeterImageCard label="Bilty Slip" src={trip.bilty_slip_image} alt="Bilty slip" />
        <MeterImageCard label="Load Photo" src={trip.load_photo} alt="Load photo" />
      </div>

      {/* Cost Breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Bilty Commission', value: formatCurrency(trip.bilty_commission_amount) },
          { label: 'Police Cost', value: formatCurrency((trip.expenses || []).filter((item) => item.category === 'police').reduce((sum, item) => sum + Number(item.amount || 0), 0)) },
          { label: 'Chalaan Cost', value: formatCurrency((trip.expenses || []).filter((item) => item.category === 'chalaan').reduce((sum, item) => sum + Number(item.amount || 0), 0)) },
          { label: 'Reward Cost', value: formatCurrency((trip.expenses || []).filter((item) => item.category === 'reward').reduce((sum, item) => sum + Number(item.amount || 0), 0)) },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-cargo-border bg-cargo-dark/20 p-3">
            <p className="text-[11px] text-cargo-muted uppercase tracking-wider font-medium">{item.label}</p>
            <p className="text-sm text-cargo-text font-semibold mt-1.5">{item.value}</p>
          </div>
        ))}
      </div>

      <ExpenseBreakdown trip={trip} />

      {trip.notes ? (
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/20 p-4">
          <p className="text-[11px] text-cargo-muted uppercase tracking-wider font-medium flex items-center gap-1 mb-2">
            <FileText className="w-3 h-3" />
            Notes
          </p>
          <p className="text-sm text-cargo-text whitespace-pre-wrap leading-relaxed">{trip.notes}</p>
        </div>
      ) : null}
    </article>
  );
};

const SummaryCard = ({ title, value, icon: Icon, highlight = false }) => (
  <div className={`card group hover:border-cargo-border/80 transition-all duration-200 ${highlight ? 'border-cargo-success/30' : ''}`}>
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm text-cargo-muted font-medium">{title}</p>
        <p className={`text-2xl font-bold mt-2 ${highlight ? 'text-cargo-success' : 'text-cargo-text'}`}>{value}</p>
      </div>
      <div className={`p-2.5 rounded-lg ${highlight ? 'bg-cargo-success/10' : 'bg-cargo-dark/30'}`}>
        <Icon className={`w-5 h-5 ${highlight ? 'text-cargo-success' : 'text-cargo-muted'}`} />
      </div>
    </div>
  </div>
);

const CarReportPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { get, loading } = useApi();
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

    const result = await get(`/admin/cars/${id}/history`, { params });

    if (result.success) {
      setReportData(result.data);
    } else {
      alert(result.error);
    }
  }, [get, id, filters]);

  useEffect(() => {
    fetchReport({ period: 'all', from_date: '', to_date: '' });
  }, [id, fetchReport]);

  const trips = reportData?.trips || [];

  const ongoingTrips = useMemo(
    () => trips.filter((trip) => trip.status === 'ongoing'),
    [trips]
  );

  const completedTrips = useMemo(
    () => trips.filter((trip) => trip.status === 'completed'),
    [trips]
  );

  return (
    <div className="space-y-6 pb-10 max-w-7xl">
      {/* Header */}
      <div className="rounded-xl border border-cargo-border bg-gradient-to-r from-cargo-card to-cargo-dark p-5 md:p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate('/cars')}
            className="btn-secondary flex items-center gap-2 hover:bg-cargo-dark/50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div>
            <h1 className="text-2xl font-bold text-cargo-text flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary-500/10">
                <Car className="w-6 h-6 text-primary-400" />
              </div>
              Cargo Report {reportData?.car?.car_number ? `- ${reportData.car.car_number}` : ''}
            </h1>
            <p className="text-cargo-muted mt-1.5 text-sm">Detailed route, expense, and meter audit per trip</p>
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <SummaryCard title="Total Revenue" value={formatCurrency(reportData?.summary?.total_revenue)} icon={TrendingUp} />
            <SummaryCard title="Total Expenses" value={formatCurrency(reportData?.summary?.total_expenses)} icon={TrendingDown} />
            <SummaryCard title="Net Income" value={formatCurrency(reportData?.summary?.net_income)} icon={Wallet} highlight />
            <SummaryCard
              title="Trips / Distance"
              value={`${reportData?.summary?.total_trips || 0} / ${(reportData?.summary?.total_distance || 0).toLocaleString()} km`}
              icon={Activity}
            />
          </div>

          {/* Current Assignment + Trip Status */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="card lg:col-span-2">
              <h2 className="text-lg font-semibold text-cargo-text mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-cargo-muted" />
                Current Assignment
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { label: 'Current Driver', value: reportData?.car?.current_driver_name || 'No active driver' },
                  { label: 'Phone', value: reportData?.car?.current_driver_phone || 'N/A' },
                  { label: 'Current Meter', value: `${(reportData?.car?.current_meter_reading || 0).toLocaleString()} km` },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-cargo-border bg-cargo-dark/20 p-4">
                    <p className="text-[11px] text-cargo-muted uppercase tracking-wider font-medium">{item.label}</p>
                    <p className="text-cargo-text mt-2 font-semibold">{item.value}</p>
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
                  <span className="text-cargo-text font-bold text-lg">{ongoingTrips.length}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-cargo-success/20 bg-cargo-success/5 p-4">
                  <div className="flex items-center gap-2.5 text-cargo-success">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="text-sm font-medium">Completed</span>
                  </div>
                  <span className="text-cargo-text font-bold text-lg">{completedTrips.length}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Driver Assignment History */}
          <div className="card">
            <h2 className="text-lg font-semibold text-cargo-text mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-cargo-muted" />
              Driver Assignment History
            </h2>
            {reportData?.assignments?.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {reportData.assignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    className="rounded-lg border border-cargo-border bg-cargo-dark/20 p-4 space-y-2 hover:border-cargo-border/80 transition-colors"
                  >
                    <p className="text-cargo-text font-semibold flex items-center gap-2">
                      <User className="w-4 h-4 text-cargo-muted" />
                      {assignment.driver_name}
                    </p>
                    <div className="flex flex-col gap-1">
                      <p className="text-sm text-cargo-muted">
                        <span className="text-cargo-text/60">Assigned:</span> {formatDate(assignment.assigned_at)}
                      </p>
                      <p className="text-sm text-cargo-muted">
                        <span className="text-cargo-text/60">Unassigned:</span>{' '}
                        {assignment.unassigned_at ? formatDate(assignment.unassigned_at) : (
                          <span className="text-cargo-accent font-medium">Currently assigned</span>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-cargo-muted">No assignment history found.</p>
            )}
          </div>

          {/* Ongoing Trips */}
          <div className="card space-y-5">
            <h2 className="text-lg font-semibold text-cargo-text flex items-center gap-2">
              <Clock3 className="w-5 h-5 text-cargo-accent" />
              Ongoing Trips
            </h2>
            {ongoingTrips.length ? (
              ongoingTrips.map((trip) => <TripCard key={trip.id} trip={trip} status="ongoing" />)
            ) : (
              <p className="text-cargo-muted">No ongoing trips in this period.</p>
            )}
          </div>

          {/* Completed Trips */}
          <div className="card space-y-5">
            <h2 className="text-lg font-semibold text-cargo-text flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-cargo-success" />
              Completed Trip Records
            </h2>
            {completedTrips.length ? (
              completedTrips.map((trip) => <TripCard key={trip.id} trip={trip} status="completed" />)
            ) : (
              <p className="text-cargo-muted">No completed trips in this period.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default CarReportPage;
