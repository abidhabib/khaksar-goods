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
  Pencil,
  Plus,
  Receipt,
  Route,
  TrendingDown,
  TrendingUp,
  User,
  Wallet,
  Trash2,
  ExternalLink,
  X,
  ZoomIn,
} from 'lucide-react';
import Modal from '../components/common/Modal';
import { useApi } from '../hooks/useApi';
import { buildGoogleMapsUrl } from '../utils/maps';

const formatCurrency = (value) => `Rs ${Number(value || 0).toLocaleString()}`;

const formatDate = (value, pattern = 'PPP p') => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return format(date, pattern);
};

const formatAverage = (value) => {
  const numericValue = Number(value || 0);
  return numericValue > 0 ? `${numericValue.toFixed(2)} km/L` : 'N/A';
};

const formatVariancePercent = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 'N/A';
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

const tripExpenseCategories = [
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

const dailyExpenseCategories = [
  'cargo_service',
  'mobile',
  'moboil_change',
  'vehicle_maintenance',
  'mechanic',
  'medical',
  'food',
  'cargo_security_guard',
  'other',
];

const sortExpensesByCategory = (expenses = [], orderedCategories = tripExpenseCategories) => [...expenses].sort((left, right) => {
  const leftIndex = orderedCategories.indexOf(left.category);
  const rightIndex = orderedCategories.indexOf(right.category);

  if (leftIndex === -1 && rightIndex === -1) {
    return String(left.category || '').localeCompare(String(right.category || ''));
  }

  if (leftIndex === -1) return 1;
  if (rightIndex === -1) return -1;
  if (leftIndex !== rightIndex) return leftIndex - rightIndex;

  return (new Date(left.created_at).getTime() || 0) - (new Date(right.created_at).getTime() || 0);
});

const sortExpenseEntriesForDisplay = (expenses = [], imageKey) => [...expenses].sort((left, right) => {
  const leftHasImage = Boolean(left[imageKey]);
  const rightHasImage = Boolean(right[imageKey]);

  if (leftHasImage !== rightHasImage) {
    return leftHasImage ? -1 : 1;
  }

  return (new Date(left.created_at).getTime() || 0) - (new Date(right.created_at).getTime() || 0);
});

const groupExpensesByCategory = (expenses = [], orderedCategories = tripExpenseCategories, imageKey = 'receipt_image') => {
  const grouped = new Map();

  sortExpensesByCategory(expenses, orderedCategories).forEach((expense) => {
    const key = expense.category || 'other';
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(expense);
  });

  return Array.from(grouped.entries()).map(([category, items]) => ({
    category,
    items: sortExpenseEntriesForDisplay(items, imageKey),
    total: items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
  }));
};

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
          type="button"
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

const InlineImagePreview = ({ src, alt, className = 'h-16 w-16' }) => (
  <div className="shrink-0">
    <ClickableImage src={src} alt={alt} className={className} />
  </div>
);

const MapLink = ({ coordinates, label = 'Open Map' }) => {
  const href = buildGoogleMapsUrl(coordinates);
  if (!href) {
    return null;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs text-primary-300 hover:text-primary-200 mt-2"
    >
      <ExternalLink className="w-3 h-3" />
      {label}
    </a>
  );
};

const ExpenseBreakdown = ({ trip, onEditExpense, onAddExpense, onDeleteExpense }) => {
  const biltyCommissionAmount = Number(trip.bilty_commission_amount) || 0;
  const hasStoredBiltyCommissionExpense = (trip.expenses || []).some((expense) => expense.category === 'bilty_commission');
  const expenses = sortExpensesByCategory([
    ...(trip.expenses || []),
    ...(!hasStoredBiltyCommissionExpense && biltyCommissionAmount > 0 ? [{
      id: `bilty-${trip.id}`,
      category: 'bilty_commission',
      amount: biltyCommissionAmount,
      created_at: trip.ended_at || trip.started_at,
      location: null,
      liters: null,
      receipt_image: trip.bilty_slip_image || null,
      notes: null,
    }] : []),
  ], tripExpenseCategories);
  const totalExpenses = Number(trip.total_expenses ?? 0);
  const groupedExpenses = groupExpensesByCategory(expenses, tripExpenseCategories, 'receipt_image');

  return (
    <div className="rounded-xl border border-cargo-border bg-cargo-dark/30 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-cargo-text font-semibold flex items-center gap-2">
          <Receipt className="w-4 h-4 text-cargo-muted" />
          Expense Breakdown
        </p>
        <div className="flex items-center gap-3">
          <p className="text-sm text-cargo-muted font-medium">Total: {formatCurrency(totalExpenses)}</p>
          <button type="button" onClick={() => onAddExpense(trip)} className="inline-flex items-center gap-1 rounded-lg bg-primary-500/15 px-3 py-2 text-primary-300">
            <Plus className="w-4 h-4" />
            Add Expense
          </button>
        </div>
      </div>

      {groupedExpenses.length ? (
        <div className="space-y-4">
          {groupedExpenses.map((group) => (
            <div key={group.category} className="rounded-lg border border-cargo-border/60 bg-cargo-card/30 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-cargo-accent/60" />
                  <p className="text-sm text-cargo-text font-semibold">{formatCategoryLabel(group.category)}</p>
                </div>
                <p className="text-sm text-cargo-muted">Total: {formatCurrency(group.total)}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {group.items.map((expense) => (
                  <div key={expense.id} className="rounded-lg bg-cargo-card/40 hover:border-cargo-border transition-colors p-3">
                    {expense.receipt_image ? (
                      <div className="mb-3">
                        <ClickableImage src={expense.receipt_image} alt={`${expense.category} receipt`} className="h-20" />
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-cargo-text font-medium">{formatCurrency(expense.amount)}</p>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => onEditExpense(trip, expense)} className="inline-flex items-center gap-1 rounded-lg bg-primary-500/15 px-2.5 py-1.5 text-xs text-primary-300">
                          <Pencil className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        {String(expense.id).startsWith('bilty-') ? null : (
                          <button type="button" onClick={() => onDeleteExpense(trip, expense)} className="inline-flex items-center gap-1 rounded-lg bg-cargo-danger/15 px-2.5 py-1.5 text-xs text-cargo-danger">
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-cargo-muted">
                      <span>{formatDate(expense.created_at)}</span>
                      {expense.liters ? <span>Liters: {Number(expense.liters).toLocaleString()}</span> : null}
                      {expense.location ? <span>Location: {expense.location}</span> : null}
                    </div>
                    <MapLink coordinates={expense.coordinates} />
                    {expense.notes ? (
                      <p className="mt-2 text-xs text-cargo-muted">{expense.notes}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-cargo-muted">No expense entries on this trip.</p>
      )}
    </div>
  );
};

const FindingTripExpenseBreakdown = ({
  trip,
  expenses = [],
  totalExpenses = 0,
  onEditDailyExpense,
  onAddDailyExpense,
  onDeleteDailyExpense,
  title = 'Finding This Trip Expenses',
  description = 'These expenses were spent while finding and preparing this trip, and they are cut from this trip.',
  allowAdd = false,
}) => {
  const groupedExpenses = groupExpensesByCategory(expenses, dailyExpenseCategories, 'expense_image');

  if (!groupedExpenses.length && !allowAdd) {
    return null;
  }

  return (
    <div className="rounded-xl border border-cargo-border bg-cargo-dark/30 p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-cargo-text font-semibold flex items-center gap-2">
            <Receipt className="w-4 h-4 text-cargo-success" />
            {title}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-cargo-muted font-medium">Total: {formatCurrency(totalExpenses)}</p>
          {allowAdd ? (
            <button type="button" onClick={() => onAddDailyExpense(trip)} className="inline-flex items-center gap-1 rounded-lg bg-primary-500/15 px-3 py-2 text-primary-300">
              <Plus className="w-4 h-4" />
              Add Expense
            </button>
          ) : null}
        </div>
      </div>

      {groupedExpenses.length ? (
        <div className="space-y-4">
          {groupedExpenses.map((group) => (
            <div key={group.category} className="rounded-lg border border-cargo-border/60 bg-cargo-card/30 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-cargo-success/60" />
                  <p className="text-sm text-cargo-text font-semibold">{formatCategoryLabel(group.category)}</p>
                </div>
                <p className="text-sm text-cargo-muted">Total: {formatCurrency(group.total)}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {group.items.map((expense) => (
                  <div key={expense.id} className="rounded-lg border border-cargo-border/60 bg-cargo-card/40 p-3 hover:border-cargo-border transition-colors">
                    {expense.expense_image ? (
                      <div className="mb-3">
                        <ClickableImage src={expense.expense_image} alt={`${expense.category} expense`} className="h-20" />
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-cargo-text font-semibold">{formatCurrency(expense.amount)}</p>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => onEditDailyExpense(trip, expense)} className="inline-flex items-center gap-1 rounded-lg bg-primary-500/15 px-2.5 py-1.5 text-xs text-primary-300">
                          <Pencil className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button type="button" onClick={() => onDeleteDailyExpense(trip, expense)} className="inline-flex items-center gap-1 rounded-lg bg-cargo-danger/15 px-2.5 py-1.5 text-xs text-cargo-danger">
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-cargo-muted">
                      <span>{formatDate(expense.created_at)}</span>
                      {expense.expense_date ? <span>Expense Date: {formatDate(expense.expense_date, 'PPP')}</span> : null}
                      {expense.meter_reading ? <span>Meter: {Number(expense.meter_reading).toLocaleString()}</span> : null}
                    </div>
                    {expense.note ? (
                      <p className="mt-2 text-xs text-cargo-muted">{expense.note}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-cargo-muted">No entries yet.</p>
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

const TripCard = ({ trip, onEditTrip, onEditExpense, onAddExpense, onDeleteExpense, onEditDailyExpense, onAddDailyExpense, onDeleteDailyExpense }) => {
  const isOngoing = trip.status === 'ongoing';
  const totalExpenses = Number(trip.total_expenses ?? 0);
  const net = Number(trip.net_profit ?? (Number(trip.freight_charge || 0) - totalExpenses));
  const actualEndLocation = trip.end_location || trip.end_live_location;
  const loadSummary = [trip.load_name, trip.load_weight].filter(Boolean).join(' • ');
  const statusVariant = trip.status === 'completed' ? 'completed' : trip.status === 'cancelled' ? 'cancelled' : 'ongoing';
  const varianceTone = getVarianceTone(trip.freight_variance_direction);

  return (
    <article className="rounded-xl bg-cargo-card/50 p-3 space-y-5 hover:border-cargo-border/80 transition-all duration-200 shadow-sm">
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

      <div className="flex justify-end">
        <button type="button" onClick={() => onEditTrip(trip)} className="inline-flex items-center gap-2 rounded-lg bg-primary-500/15 px-3 py-2 text-sm text-primary-300">
          <Pencil className="w-4 h-4" />
          Edit Trip
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Started', value: formatDate(trip.started_at), icon: Calendar },
          { label: 'Ended', value: isOngoing ? 'In progress' : formatDate(trip.ended_at), icon: Clock3 },
          { label: 'Freight', value: formatCurrency(trip.freight_charge), subvalue: `↕ ${formatVariancePercent(trip.freight_variance_percentage)}`, icon: Wallet, tone: varianceTone },
          { label: 'Expenses', value: formatCurrency(totalExpenses), icon: TrendingDown },
          { label: 'Net income', value: formatCurrency(net), icon: TrendingUp, highlight: true },
          { label: 'Distance', value: `${Math.max((Number(trip.end_meter_reading) || 0) - (Number(trip.start_meter_reading) || 0), 0).toLocaleString()} km`, subvalue: `Avg: ${formatAverage(trip.trip_average_km_per_liter)}`, icon: Activity },
        ].map((item) => (
          <div key={item.label} className={`rounded-lg border p-3 ${item.highlight ? 'border-cargo-success/30 bg-cargo-success/5' : 'border-cargo-border bg-cargo-dark/20'}`}>
            <p className="text-xs text-cargo-muted font-medium flex items-center gap-1">
              <item.icon className="w-3 h-3" />
              {item.label}
            </p>
            <p className={`text-sm font-semibold mt-1.5 ${item.highlight ? 'text-cargo-success' : item.tone || 'text-cargo-text'}`}>
              {item.value}
            </p>
            {item.subvalue ? <p className={`text-xs mt-1 ${item.tone || 'text-cargo-muted'}`}>{item.subvalue}</p> : null}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/20 p-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-cargo-muted uppercase tracking-wider font-medium flex items-center gap-1"><Gauge className="w-3 h-3" />Start Meter</p>
            <p className="text-sm text-cargo-text font-semibold mt-1.5">{(Number(trip.start_meter_reading) || 0).toLocaleString()}</p>
            <p className="text-xs text-cargo-muted mt-1">{trip.start_live_location || trip.from_location || 'N/A'}</p>
            <MapLink coordinates={trip.start_coordinates} />
          </div>
          <InlineImagePreview src={trip.start_meter_image} alt="Start meter" />
        </div>
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/20 p-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-cargo-muted uppercase tracking-wider font-medium flex items-center gap-1"><Gauge className="w-3 h-3" />End Meter</p>
            <p className="text-sm text-cargo-text font-semibold mt-1.5">{trip.end_meter_reading ? Number(trip.end_meter_reading).toLocaleString() : isOngoing ? 'Pending' : 'N/A'}</p>
            <p className="text-xs text-cargo-muted mt-1">{actualEndLocation || (isOngoing ? 'In progress' : 'N/A')}</p>
            <MapLink coordinates={trip.end_coordinates} />
          </div>
          <InlineImagePreview src={trip.end_meter_image} alt="End meter" />
        </div>
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/20 p-3">
          <p className="text-[11px] text-cargo-muted uppercase tracking-wider font-medium flex items-center gap-1"><MapPin className="w-3 h-3" />Live Start</p>
          <p className="text-sm text-cargo-text font-semibold mt-1.5">{trip.start_live_location || trip.from_location || 'N/A'}</p>
        </div>
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/20 p-3">
          <p className="text-[11px] text-cargo-muted uppercase tracking-wider font-medium flex items-center gap-1"><MapPin className="w-3 h-3" />Actual End</p>
          <p className="text-sm text-cargo-text font-semibold mt-1.5">{actualEndLocation || (isOngoing ? 'In progress' : 'N/A')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/20 p-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-cargo-muted uppercase tracking-wider font-medium">Load Details</p>
            <p className="text-sm text-cargo-text font-semibold mt-1.5">{loadSummary || 'N/A'}</p>
            <p className="text-xs text-cargo-muted mt-1">{trip.load_live_location || 'No load location'}</p>
            <MapLink coordinates={trip.load_coordinates} />
          </div>
          <InlineImagePreview src={trip.load_photo} alt="Load photo" />
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

      <ExpenseBreakdown trip={trip} onEditExpense={onEditExpense} onAddExpense={onAddExpense} onDeleteExpense={onDeleteExpense} />

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
  const { get, post, put, del, loading } = useApi();
  const [trip, setTrip] = useState(null);
  const [editingTrip, setEditingTrip] = useState(null);
  const [savingTrip, setSavingTrip] = useState(false);
  const [tripForm, setTripForm] = useState({
    start_meter_reading: '',
    end_meter_reading: '',
    freight_charge: '',
    from_location: '',
    to_location: '',
    notes: '',
  });
  const [expenseModal, setExpenseModal] = useState({ isOpen: false, tripId: null, expenseId: null, type: 'trip', driverId: null });
  const [expenseForm, setExpenseForm] = useState({
    category: 'diesel',
    amount: '',
    liters: '',
    location: '',
    notes: '',
    expense_date: '',
    meter_reading: '',
  });
  const [savingExpense, setSavingExpense] = useState(false);

  const fetchTripReport = async () => {
    const result = await get(`/admin/trips/${id}/report`);
    if (result.success) {
      setTrip({
        ...result.data.trip,
        expenses: result.data.expenses || [],
      });
    }
  };

  useEffect(() => {
    fetchTripReport();
  }, [get, id]);

  const openTripModal = (tripRow) => {
    setEditingTrip(tripRow);
    setTripForm({
      start_meter_reading: tripRow.start_meter_reading ?? '',
      end_meter_reading: tripRow.end_meter_reading ?? '',
      freight_charge: tripRow.freight_charge ?? '',
      from_location: tripRow.from_location || '',
      to_location: tripRow.to_location || '',
      notes: tripRow.notes || '',
    });
  };

  const closeTripModal = () => setEditingTrip(null);

  const handleTripSave = async (e) => {
    e.preventDefault();
    if (!editingTrip) return;
    setSavingTrip(true);
    const result = await put(`/admin/trips/${editingTrip.id}`, tripForm);
    setSavingTrip(false);
    if (!result.success) {
      alert(result.error);
      return;
    }
    closeTripModal();
    fetchTripReport();
  };

  const openExpenseAddModal = (tripRow) => {
    setExpenseModal({ isOpen: true, tripId: tripRow.id, expenseId: null, type: 'trip', driverId: tripRow.driver_id ?? null });
    setExpenseForm({ category: 'diesel', amount: '', liters: '', location: '', notes: '', expense_date: '', meter_reading: '' });
  };

  const openExpenseEditModal = (tripRow, expense) => {
    setExpenseModal({ isOpen: true, tripId: tripRow.id, expenseId: expense.id, type: 'trip', driverId: tripRow.driver_id ?? null });
    setExpenseForm({
      category: expense.category || 'diesel',
      amount: expense.amount ?? '',
      liters: expense.liters ?? '',
      location: expense.location || '',
      notes: expense.notes || '',
      expense_date: '',
      meter_reading: '',
    });
  };

  const openDailyExpenseAddModal = (tripRow) => {
    setExpenseModal({ isOpen: true, tripId: tripRow.id, expenseId: null, type: 'daily', driverId: tripRow.driver_id ?? null });
    setExpenseForm({ category: 'food', amount: '', liters: '', location: '', notes: '', expense_date: '', meter_reading: '' });
  };

  const openDailyExpenseEditModal = (tripRow, expense) => {
    setExpenseModal({ isOpen: true, tripId: tripRow.id, expenseId: expense.id, type: 'daily', driverId: tripRow.driver_id ?? null });
    setExpenseForm({
      category: expense.category || 'food',
      amount: expense.amount ?? '',
      liters: '',
      location: '',
      notes: expense.note || '',
      expense_date: expense.expense_date ? String(expense.expense_date).slice(0, 10) : '',
      meter_reading: expense.meter_reading ?? '',
    });
  };

  const closeExpenseModal = () => {
    setExpenseModal({ isOpen: false, tripId: null, expenseId: null, type: 'trip', driverId: null });
  };

  const handleExpenseSave = async (e) => {
    e.preventDefault();
    setSavingExpense(true);
    const payload = expenseModal.type === 'daily'
      ? {
        driver_id: expenseModal.driverId,
        category: expenseForm.category,
        amount: expenseForm.amount,
        note: expenseForm.notes,
        expense_date: expenseForm.expense_date,
        meter_reading: expenseForm.meter_reading,
      }
      : expenseForm;
    const result = expenseModal.type === 'daily'
      ? (
        expenseModal.expenseId
          ? await put(`/admin/drivers-expenses/${expenseModal.expenseId}`, payload)
          : await post('/admin/drivers-expenses', payload)
      )
      : (
        expenseModal.expenseId
          ? await put(`/admin/trip-expenses/${expenseModal.expenseId}`, payload)
          : await post(`/admin/trips/${expenseModal.tripId}/expenses`, payload)
      );
    setSavingExpense(false);

    if (!result.success) {
      alert(result.error);
      return;
    }

    closeExpenseModal();
    fetchTripReport();
  };

  const handleTripExpenseDelete = async (_tripRow, expense) => {
    if (!expense?.id || String(expense.id).startsWith('bilty-') || !window.confirm('Delete this trip expense?')) {
      return;
    }

    const result = await del(`/admin/trip-expenses/${expense.id}`);
    if (!result.success) {
      alert(result.error);
      return;
    }

    fetchTripReport();
  };

  const handleDailyExpenseDelete = async (_tripRow, expense) => {
    if (!expense?.id || !window.confirm('Delete this daily expense?')) {
      return;
    }

    const result = await del(`/admin/drivers-expenses/${expense.id}`);
    if (!result.success) {
      alert(result.error);
      return;
    }

    fetchTripReport();
  };

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
    <>
      <div className="space-y-6 pb-10  max-w-7xl">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="btn-secondary p-2">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-cargo-text">Trip Report</h1>
          </div>
        </div>

        <FindingTripExpenseBreakdown
          trip={trip}
          expenses={trip.pending_next_trip_daily_expenses || []}
          totalExpenses={Number(trip.pending_next_trip_expenses_total || 0)}
          onEditDailyExpense={openDailyExpenseEditModal}
          onAddDailyExpense={openDailyExpenseAddModal}
          onDeleteDailyExpense={handleDailyExpenseDelete}
          title="Waiting For Next Trip Expenses"
          description="These expenses are still independent because the next trip has not started yet, so they are not cut from this trip."
          allowAdd
        />

        <TripCard
          trip={trip}
          onEditTrip={openTripModal}
          onEditExpense={openExpenseEditModal}
          onAddExpense={openExpenseAddModal}
          onDeleteExpense={handleTripExpenseDelete}
          onEditDailyExpense={openDailyExpenseEditModal}
          onAddDailyExpense={openDailyExpenseAddModal}
          onDeleteDailyExpense={handleDailyExpenseDelete}
        />
      </div>

      <Modal isOpen={Boolean(editingTrip)} onClose={closeTripModal} title="Edit Trip">
        <form onSubmit={handleTripSave} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input type="number" min="0" step="0.01" value={tripForm.start_meter_reading} onChange={(e) => setTripForm((prev) => ({ ...prev, start_meter_reading: e.target.value }))} className="input-field w-full" placeholder="Start Meter Reading" />
            <input type="number" min="0" step="0.01" value={tripForm.end_meter_reading} onChange={(e) => setTripForm((prev) => ({ ...prev, end_meter_reading: e.target.value }))} className="input-field w-full" placeholder="End Meter Reading" />
            <input type="text" value={tripForm.from_location} onChange={(e) => setTripForm((prev) => ({ ...prev, from_location: e.target.value }))} className="input-field w-full" placeholder="From Location" />
            <input type="text" value={tripForm.to_location} onChange={(e) => setTripForm((prev) => ({ ...prev, to_location: e.target.value }))} className="input-field w-full" placeholder="To Location" />
            <input type="number" min="0" step="0.01" value={tripForm.freight_charge} onChange={(e) => setTripForm((prev) => ({ ...prev, freight_charge: e.target.value }))} className="input-field w-full md:col-span-2" placeholder="Freight Charge" />
          </div>
          <textarea value={tripForm.notes} onChange={(e) => setTripForm((prev) => ({ ...prev, notes: e.target.value }))} className="input-field w-full min-h-24" placeholder="Notes" />
          <div className="flex gap-3">
            <button type="button" onClick={closeTripModal} className="flex-1 btn-secondary">Cancel</button>
            <button type="submit" disabled={savingTrip} className="flex-1 btn-primary">{savingTrip ? 'Saving...' : 'Save Trip'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={expenseModal.isOpen} onClose={closeExpenseModal} title={expenseModal.type === 'daily' ? (expenseModal.expenseId ? 'Edit While Looking For Next Trip Expense' : 'Add While Looking For Next Trip Expense') : (expenseModal.expenseId ? 'Edit Trip Expense' : 'Add Trip Expense')}>
        <form onSubmit={handleExpenseSave} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <select value={expenseForm.category} onChange={(e) => setExpenseForm((prev) => ({ ...prev, category: e.target.value }))} className="input-field w-full">
              {(expenseModal.type === 'daily' ? dailyExpenseCategories : tripExpenseCategories).map((category) => (
                <option key={category} value={category}>{formatCategoryLabel(category)}</option>
              ))}
            </select>
            <input type="number" min="0" step="0.01" value={expenseForm.amount} onChange={(e) => setExpenseForm((prev) => ({ ...prev, amount: e.target.value }))} className="input-field w-full" placeholder="Amount" />
            {expenseModal.type === 'daily' ? (
              <>
                <input type="date" value={expenseForm.expense_date} onChange={(e) => setExpenseForm((prev) => ({ ...prev, expense_date: e.target.value }))} className="input-field w-full" />
                <input type="number" min="0" step="0.01" value={expenseForm.meter_reading} onChange={(e) => setExpenseForm((prev) => ({ ...prev, meter_reading: e.target.value }))} className="input-field w-full" placeholder="Meter Reading" />
              </>
            ) : (
              <>
                <input type="number" min="0" step="0.01" value={expenseForm.liters} onChange={(e) => setExpenseForm((prev) => ({ ...prev, liters: e.target.value }))} className="input-field w-full" placeholder="Liters" />
                <input type="text" value={expenseForm.location} onChange={(e) => setExpenseForm((prev) => ({ ...prev, location: e.target.value }))} className="input-field w-full" placeholder="Location" />
              </>
            )}
          </div>
          <textarea value={expenseForm.notes} onChange={(e) => setExpenseForm((prev) => ({ ...prev, notes: e.target.value }))} className="input-field w-full min-h-24" placeholder={expenseModal.type === 'daily' ? 'Name / Notes' : 'Notes'} />
          <div className="flex gap-3">
            <button type="button" onClick={closeExpenseModal} className="flex-1 btn-secondary">Cancel</button>
            <button type="submit" disabled={savingExpense} className="flex-1 btn-primary">{savingExpense ? 'Saving...' : expenseModal.expenseId ? 'Save Expense' : 'Add Expense'}</button>
          </div>
        </form>
      </Modal>
    </>
  );
};

export default TripReportPage;
