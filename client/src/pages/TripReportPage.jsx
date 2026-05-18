import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  Calendar,
  Car,
  Clock3,
  FileText,
  Gauge,
  MapPin,
  Receipt,
  Route,
  TrendingDown,
  TrendingUp,
  User,
  Wallet,
  X,
  ZoomIn,
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

const formatAverage = (value) => {
  const numericValue = Number(value || 0);
  return numericValue > 0 ? `${numericValue.toFixed(2)} km/L` : 'N/A';
};

const formatVariancePercent = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 'N/A';
  }

  return `${numericValue > 0 ? '+' : ''}${numericValue.toFixed(2)}%`;
};

const getVarianceTone = (direction) => {
  if (direction === 'up') return 'text-cargo-success';
  if (direction === 'down') return 'text-cargo-danger';
  return 'text-cargo-muted';
};

const formatCategoryLabel = (value) =>
  String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

const tripExpenseCategoryOrder = [
  'diesel',
  'food',
  'toll',
  'police',
  'chalaan',
  'mandi_kaat',
  'reward',
  'tyre_puncture',
  'bilty_commission',
];

const sortExpensesByCategory = (expenses = []) => [...expenses].sort((left, right) => {
  const leftIndex = tripExpenseCategoryOrder.indexOf(left.category);
  const rightIndex = tripExpenseCategoryOrder.indexOf(right.category);

  if (leftIndex === -1 && rightIndex === -1) {
    return String(left.category || '').localeCompare(String(right.category || ''));
  }

  if (leftIndex === -1) return 1;
  if (rightIndex === -1) return -1;
  if (leftIndex !== rightIndex) return leftIndex - rightIndex;

  return (new Date(left.created_at).getTime() || 0) - (new Date(right.created_at).getTime() || 0);
});

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex max-w-2xl w-[90vw] max-h-[90vh] items-center justify-center"
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
        {alt ? (
          <p className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-sm px-4 py-2 rounded-b-lg backdrop-blur-sm">
            {alt}
          </p>
        ) : null}
      </div>
    </div>
  );
};

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
  const biltyCommissionAmount = Number(trip.bilty_commission_amount) || 0;
  const expenses = sortExpensesByCategory([
    ...(trip.expenses || []),
    ...(biltyCommissionAmount > 0 ? [{
      id: `bilty-${trip.id}`,
      category: 'bilty_commission',
      amount: biltyCommissionAmount,
      created_at: trip.ended_at || trip.started_at,
      location: null,
      liters: null,
      receipt_image: null,
    }] : []),
  ]);
  const totalExpenses = Number(trip.total_expenses ?? 0);

  return (
    <div className="rounded-xl border border-cargo-border bg-cargo-dark/30 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-cargo-text font-semibold flex items-center gap-2">
          <Receipt className="w-4 h-4 text-cargo-muted" />
          Expense Breakdown
        </p>
        <p className="text-sm text-cargo-muted font-medium">Total: {formatCurrency(totalExpenses)}</p>
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
    cancelled: 'bg-cargo-danger/15 text-cargo-danger border-cargo-danger/20',
    default: 'bg-cargo-dark/40 text-cargo-muted border-cargo-border/60',
  };

  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border ${variants[variant] || variants.default}`}>
      {children}
    </span>
  );
};

const TripCard = ({ trip }) => {
  const isOngoing = trip.status === 'ongoing';
  const totalExpenses = Number(trip.total_expenses ?? 0);
  const net = Number(trip.net_profit ?? (Number(trip.freight_charge || 0) - totalExpenses));
  const actualEndLocation = trip.end_location || trip.end_live_location;
  const loadSummary = [trip.load_name, trip.load_weight].filter(Boolean).join(' • ');
  const statusVariant = trip.status === 'completed' ? 'completed' : trip.status === 'cancelled' ? 'cancelled' : 'ongoing';
  const varianceTone = getVarianceTone(trip.freight_variance_direction);

  return (
    <article className="rounded-xl border border-cargo-border bg-cargo-card/50 p-5 space-y-5 hover:border-cargo-border/80 transition-all duration-200 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={`mt-1 p-2 rounded-lg ${isOngoing ? 'bg-cargo-accent/10' : trip.status === 'cancelled' ? 'bg-cargo-danger/10' : 'bg-cargo-success/10'}`}>
            <Route className={`w-4 h-4 ${isOngoing ? 'text-cargo-accent' : trip.status === 'cancelled' ? 'text-cargo-danger' : 'text-cargo-success'}`} />
          </div>
          <div>
            <p className="text-cargo-text font-bold text-base">
              {trip.from_location} <span className="text-cargo-muted font-normal mx-1">→</span> {trip.to_location}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-cargo-muted">
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" />
                {trip.driver_name || 'N/A'}
              </span>
              <span className="flex items-center gap-1">
                <Car className="w-3 h-3" />
                Car: {trip.car_number || 'N/A'}
              </span>
            </div>
          </div>
        </div>
        <StatBadge variant={statusVariant}>
          {String(trip.status || 'unknown').charAt(0).toUpperCase() + String(trip.status || 'unknown').slice(1)}
        </StatBadge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Started', value: formatDate(trip.started_at), icon: Calendar },
          { label: 'Ended', value: isOngoing ? 'In progress' : formatDate(trip.ended_at), icon: Clock3 },
          {
            label: 'Freight',
            value: formatCurrency(trip.freight_charge),
            subvalue: `↕ ${formatVariancePercent(trip.freight_variance_percentage)}`,
            icon: Wallet,
            tone: varianceTone
          },
          { label: 'Expenses', value: formatCurrency(totalExpenses), icon: TrendingDown },
          { label: 'Net income', value: formatCurrency(net), icon: TrendingUp, highlight: true },
          {
            label: 'Distance',
            value: `${Math.max((Number(trip.end_meter_reading) || 0) - (Number(trip.start_meter_reading) || 0), 0).toLocaleString()} km`,
            subvalue: `Avg: ${formatAverage(trip.trip_average_km_per_liter)}`,
            icon: Activity
          },
        ].map((item) => (
          <div
            key={item.label}
            className={`rounded-lg border p-3 ${item.highlight ? 'border-cargo-success/30 bg-cargo-success/5' : 'border-cargo-border bg-cargo-dark/20'}`}
          >
            <p className="text-xs text-cargo-muted font-medium flex items-center gap-1">
              <item.icon className="w-3 h-3" />
              {item.label}
            </p>
            <p className={`text-sm font-semibold mt-1.5 ${item.highlight ? 'text-cargo-success' : item.tone || 'text-cargo-text'}`}>
              {item.value}
            </p>
            {item.subvalue ? (
              <p className={`text-xs mt-1 ${item.tone || 'text-cargo-muted'}`}>
                {item.subvalue}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/20 p-3">
          <p className="text-[11px] text-cargo-muted uppercase tracking-wider font-medium flex items-center gap-1">
            <Gauge className="w-3 h-3" />Start Meter
          </p>
          <p className="text-sm text-cargo-text font-semibold mt-1.5">{(Number(trip.start_meter_reading) || 0).toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/20 p-3">
          <p className="text-[11px] text-cargo-muted uppercase tracking-wider font-medium flex items-center gap-1">
            <Gauge className="w-3 h-3" />End Meter
          </p>
          <p className="text-sm text-cargo-text font-semibold mt-1.5">
            {trip.end_meter_reading ? Number(trip.end_meter_reading).toLocaleString() : isOngoing ? 'Pending' : 'N/A'}
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
          <p className="text-[11px] text-cargo-muted uppercase tracking-wider font-medium">Expected Freight</p>
          <p className="text-sm text-cargo-text font-semibold mt-1.5">{trip.expected_freight_charge ? formatCurrency(trip.expected_freight_charge) : 'N/A'}</p>
        </div>
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/20 p-3">
          <p className="text-[11px] text-cargo-muted uppercase tracking-wider font-medium">Variance Amount</p>
          <p className={`text-sm font-semibold mt-1.5 ${varianceTone}`}>{trip.freight_variance_amount !== null && trip.freight_variance_amount !== undefined ? formatCurrency(trip.freight_variance_amount) : 'N/A'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MeterImageCard label="Start Meter Photo" src={trip.start_meter_image} alt="Start meter" />
        <MeterImageCard label="End Meter Photo" src={trip.end_meter_image} alt="End meter" />
        <MeterImageCard label="Bilty Slip" src={trip.bilty_slip_image} alt="Bilty slip" />
        <MeterImageCard label="Load Photo" src={trip.load_photo} alt="Load photo" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Diesel Liters', value: `${Number(trip.total_diesel_liters || 0).toLocaleString()} L` },
          { label: 'Phone', value: trip.driver_phone || 'N/A' },
          { label: 'License', value: trip.license_number || 'N/A' },
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

const TripReportPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { get, loading } = useApi();
  const [trip, setTrip] = useState(null);

  useEffect(() => {
    const fetchTripReport = async () => {
      const result = await get(`/admin/trips/${id}/report`);
      if (result.success) {
        setTrip({
          ...result.data.trip,
          expenses: result.data.expenses || [],
        });
      }
    };

    fetchTripReport();
  }, [get, id]);

  if (loading && !trip) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="card text-center py-12">
        <FileText className="w-12 h-12 text-cargo-muted mx-auto mb-4" />
        <p className="text-lg font-semibold text-cargo-text">Trip report not found</p>
        <button onClick={() => navigate(-1)} className="btn-secondary mt-4">
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-secondary p-2">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-cargo-text">Trip Report</h1>
        </div>
      </div>

      <TripCard trip={trip} />
    </div>
  );
};

export default TripReportPage;
