import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Calendar,
  Car,
  CheckCircle2,
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
  Trash2,
  User,
  Wallet,
  X,
  XCircle,
  ZoomIn,
  ExternalLink,
} from 'lucide-react';
import Modal from '../components/common/Modal';
import { useApi } from '../hooks/useApi';
import { buildGoogleMapsUrl } from '../utils/maps';

const formatCurrency = (value) => `Rs ${Number(value || 0).toLocaleString()}`;

const formatDate = (value, pattern = 'default') => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return pattern === 'date' ? date.toLocaleDateString() : date.toLocaleString();
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

const getStatusClasses = (status) => {
  if (status === 'approved') return 'bg-cargo-success/15 text-cargo-success border-cargo-success/20';
  if (status === 'rejected') return 'bg-cargo-danger/15 text-cargo-danger border-cargo-danger/20';
  return 'bg-cargo-accent/15 text-cargo-accent border-cargo-accent/20';
};

const getVarianceTone = (direction) => {
  if (direction === 'up') return 'text-cargo-success';
  if (direction === 'down') return 'text-cargo-danger';
  return 'text-cargo-muted';
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

const ExpenseBreakdown = ({ row, onEditExpense, onAddExpense, onDeleteExpense }) => {
  const biltyCommissionAmount = Number(row.bilty_commission_amount) || 0;
  const hasStoredBiltyCommissionExpense = (row.expenses || []).some((expense) => expense.category === 'bilty_commission');
  const expenses = sortExpensesByCategory([
    ...(row.expenses || []),
    ...(!hasStoredBiltyCommissionExpense && biltyCommissionAmount > 0 ? [{
      id: `bilty-${row.trip_id}`,
      category: 'bilty_commission',
      amount: biltyCommissionAmount,
      created_at: row.ended_at || row.started_at,
      location: null,
      liters: null,
      receipt_image: row.bilty_slip_image || null,
      notes: null,
    }] : []),
  ], tripExpenseCategories);
  const totalExpenses = Number(row.trip_expenses_total ?? row.total_expenses ?? 0);
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
          <button type="button" onClick={() => onAddExpense(row)} className="inline-flex items-center gap-1 rounded-lg bg-primary-500/15 px-3 py-2 text-primary-300">
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
                  <div key={expense.id} className="rounded-lg bg-cargo-card/40 p-3 hover:border-cargo-border transition-colors">
                    {expense.receipt_image ? (
                      <div className="mb-3">
                        <ClickableImage src={expense.receipt_image} alt={`${expense.category} receipt`} className="h-20" />
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-cargo-text font-semibold">{formatCurrency(expense.amount)}</p>
                      {String(expense.id).startsWith('bilty-') ? null : (
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => onEditExpense(row, expense)} className="inline-flex items-center gap-1 rounded-lg bg-primary-500/15 px-2.5 py-1.5 text-xs text-primary-300">
                            <Pencil className="w-3.5 h-3.5" />
                            Edit
                          </button>
                          <button type="button" onClick={() => onDeleteExpense(row, expense)} className="inline-flex items-center gap-1 rounded-lg bg-cargo-danger/15 px-2.5 py-1.5 text-xs text-cargo-danger">
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-cargo-muted">
                      <span>{formatDate(expense.created_at)}</span>
                      {expense.liters ? <span>Liters: {Number(expense.liters).toLocaleString()}</span> : null}
                      {expense.location ? <span>Location: {expense.location}</span> : null}
                    </div>
                    <MapLink coordinates={expense.coordinates} />
                    {expense.notes ? <p className="mt-2 text-xs text-cargo-muted">{expense.notes}</p> : null}
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
  row,
  expenses = [],
  totalExpenses = 0,
  onEditDailyExpense,
  onAddDailyExpense,
  onDeleteDailyExpense,
  title = 'Finding This Trip Expenses',
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
            <button type="button" onClick={() => onAddDailyExpense(row)} className="inline-flex items-center gap-1 rounded-lg bg-primary-500/15 px-3 py-2 text-primary-300">
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
                        <button type="button" onClick={() => onEditDailyExpense(row, expense)} className="inline-flex items-center gap-1 rounded-lg bg-primary-500/15 px-2.5 py-1.5 text-xs text-primary-300">
                          <Pencil className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button type="button" onClick={() => onDeleteDailyExpense(row, expense)} className="inline-flex items-center gap-1 rounded-lg bg-cargo-danger/15 px-2.5 py-1.5 text-xs text-cargo-danger">
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-cargo-muted">
                      <span>{formatDate(expense.created_at)}</span>
                      {expense.expense_date ? <span>Expense Date: {formatDate(expense.expense_date, 'date')}</span> : null}
                      {expense.meter_reading ? <span>Meter: {Number(expense.meter_reading).toLocaleString()}</span> : null}
                    </div>
                    {expense.note ? <p className="mt-2 text-xs text-cargo-muted">{expense.note}</p> : null}
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

const SummaryCard = ({ icon: Icon, label, value, tone = 'text-cargo-text' }) => (
  <div className="rounded-xl border border-cargo-border bg-cargo-card/60 p-4">
    <p className="text-sm text-cargo-muted flex items-center gap-2">
      <Icon className="w-4 h-4" />
      {label}
    </p>
    <p className={`text-2xl font-bold mt-2 ${tone}`}>{value}</p>
  </div>
);

const RequestCard = ({
  row,
  busyId,
  onEditCommission,
  onStatusChange,
  onEditTrip,
  onEditExpense,
  onAddExpense,
  onDeleteExpense,
  onEditDailyExpense,
  onAddDailyExpense,
  onDeleteDailyExpense,
}) => {
  const pending = row.status === 'pending';
  const distance = Math.max((Number(row.end_meter_reading) || 0) - (Number(row.start_meter_reading) || 0), 0);
  const varianceTone = getVarianceTone(row.freight_variance_direction);
  const reviewedAt = row.reviewed_at || row.updated_at;

  return (
    <article className="rounded-xl bg-cargo-card/50 p-3 space-y-5 hover:border-cargo-border/80 transition-all duration-200 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={`mt-1 p-2 rounded-lg ${pending ? 'bg-cargo-accent/10' : row.status === 'approved' ? 'bg-cargo-success/10' : 'bg-cargo-danger/10'}`}>
            <Route className={`w-4 h-4 ${pending ? 'text-cargo-accent' : row.status === 'approved' ? 'text-cargo-success' : 'text-cargo-danger'}`} />
          </div>
          <div>
            <p className="text-cargo-text font-bold text-base">
              {row.from_location} <span className="text-cargo-muted font-normal mx-1">→</span> {row.to_location}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-cargo-muted">
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" />
                {row.driver_full_name || row.driver_username || 'N/A'}
              </span>
              <span className="flex items-center gap-1">
                <Car className="w-3 h-3" />
                Car: {row.car_number || 'No cargo assigned'}
              </span>
              <span>Trip #{row.trip_id}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="rounded-lg bg-primary-500/10 px-3 py-2 text-sm font-medium text-primary-300">
            Commission {formatCurrency(row.commission_amount)}
          </span>
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border capitalize ${getStatusClasses(row.status)}`}>
            {row.status}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => onEditTrip(row)} className="inline-flex items-center gap-2 rounded-lg bg-primary-500/15 px-3 py-2 text-sm text-primary-300">
          <Pencil className="w-4 h-4" />
          Edit Trip
        </button>
        {pending ? (
          <button
            type="button"
            onClick={() => onEditCommission(row)}
            disabled={busyId === row.request_id}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-500/15 px-3 py-2 text-sm text-primary-300 hover:bg-primary-500/20"
          >
            <Pencil className="w-4 h-4" />
            Edit Request
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Requested', value: formatDate(row.created_at), icon: Calendar },
          { label: 'Reviewed', value: pending ? 'Waiting' : formatDate(reviewedAt), icon: Clock3 },
          { label: 'Freight', value: formatCurrency(row.freight_charge), subvalue: `↕ ${formatVariancePercent(row.freight_variance_percentage)}`, icon: Wallet, tone: varianceTone },
          { label: 'Expenses', value: formatCurrency(row.total_expenses), icon: TrendingDown },
          { label: 'Net income', value: formatCurrency(row.net_profit ?? row.net_income), icon: TrendingUp, highlight: true },
          { label: 'Distance', value: `${distance.toLocaleString()} km`, subvalue: `Avg: ${formatAverage(row.trip_average_km_per_liter)}`, icon: Activity },
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
            {item.subvalue ? <p className={`text-xs mt-1 ${item.tone || 'text-cargo-muted'}`}>{item.subvalue}</p> : null}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/20 p-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-cargo-muted uppercase tracking-wider font-medium flex items-center gap-1">
              <Gauge className="w-3 h-3" />
              Start Meter
            </p>
            <p className="text-sm text-cargo-text font-semibold mt-1.5">{(Number(row.start_meter_reading) || 0).toLocaleString()}</p>
            <p className="text-xs text-cargo-muted mt-1">{row.start_live_location || row.from_location || 'N/A'}</p>
            <MapLink coordinates={row.start_coordinates} />
          </div>
          <InlineImagePreview src={row.start_meter_image} alt="Start meter" />
        </div>
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/20 p-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-cargo-muted uppercase tracking-wider font-medium flex items-center gap-1">
              <Gauge className="w-3 h-3" />
              End Meter
            </p>
            <p className="text-sm text-cargo-text font-semibold mt-1.5">{row.end_meter_reading ? Number(row.end_meter_reading).toLocaleString() : 'N/A'}</p>
            <p className="text-xs text-cargo-muted mt-1">{row.end_location || row.end_live_location || 'N/A'}</p>
            <MapLink coordinates={row.end_coordinates} />
          </div>
          <InlineImagePreview src={row.end_meter_image} alt="End meter" />
        </div>
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/20 p-3">
          <p className="text-[11px] text-cargo-muted uppercase tracking-wider font-medium flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            Live Start
          </p>
          <p className="text-sm text-cargo-text font-semibold mt-1.5">{row.start_live_location || row.from_location || 'N/A'}</p>
        </div>
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/20 p-3">
          <p className="text-[11px] text-cargo-muted uppercase tracking-wider font-medium flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            Actual End
          </p>
          <p className="text-sm text-cargo-text font-semibold mt-1.5">{row.end_location || row.end_live_location || 'N/A'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/20 p-3">
          <p className="text-[11px] text-cargo-muted uppercase tracking-wider font-medium">Driver Phone</p>
          <p className="text-sm text-cargo-text font-semibold mt-1.5">{row.driver_phone || 'N/A'}</p>
        </div>
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/20 p-3">
          <p className="text-[11px] text-cargo-muted uppercase tracking-wider font-medium">License</p>
          <p className="text-sm text-cargo-text font-semibold mt-1.5">{row.license_number || 'N/A'}</p>
        </div>
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/20 p-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-cargo-muted uppercase tracking-wider font-medium">Load Details</p>
            <p className="text-sm text-cargo-text font-semibold mt-1.5">
              {[row.load_name, row.load_weight].filter(Boolean).join(' • ') || 'N/A'}
            </p>
            <p className="text-xs text-cargo-muted mt-1">{row.load_live_location || 'No load location'}</p>
            <MapLink coordinates={row.load_coordinates} />
          </div>
          <InlineImagePreview src={row.load_photo} alt="Load photo" />
        </div>
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/20 p-3">
          <p className="text-[11px] text-cargo-muted uppercase tracking-wider font-medium">Reviewed By</p>
          <p className="text-sm text-cargo-text font-semibold mt-1.5">{row.reviewed_by_username || 'N/A'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/20 p-3">
          <p className="text-[11px] text-cargo-muted uppercase tracking-wider font-medium">Commission %</p>
          <p className="text-sm text-cargo-text font-semibold mt-1.5">{Number(row.commission_percentage || 0)}%</p>
        </div>
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/20 p-3">
          <p className="text-[11px] text-cargo-muted uppercase tracking-wider font-medium">Commission Amount</p>
          <p className="text-sm text-cargo-text font-semibold mt-1.5">{formatCurrency(row.commission_amount)}</p>
        </div>
      </div>
      <ExpenseBreakdown row={row} onEditExpense={onEditExpense} onAddExpense={onAddExpense} onDeleteExpense={onDeleteExpense} />

      {row.remarks ? (
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/20 p-4">
          <p className="text-[11px] text-cargo-muted uppercase tracking-wider font-medium flex items-center gap-1 mb-2">
            <FileText className="w-3 h-3" />
            Remarks
          </p>
          <p className="text-sm text-cargo-text whitespace-pre-wrap leading-relaxed">{row.remarks}</p>
        </div>
      ) : null}

      {pending ? (
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => onStatusChange(row.request_id, 'approved')}
            disabled={busyId === row.request_id}
            className="inline-flex items-center gap-2 rounded-lg bg-cargo-success/15 px-3 py-2 text-sm text-cargo-success hover:bg-cargo-success/20"
          >
            <CheckCircle2 className="w-4 h-4" />
            Approve
          </button>
          <button
            type="button"
            onClick={() => onStatusChange(row.request_id, 'rejected')}
            disabled={busyId === row.request_id}
            className="inline-flex items-center gap-2 rounded-lg bg-cargo-danger/15 px-3 py-2 text-sm text-cargo-danger hover:bg-cargo-danger/20"
          >
            <XCircle className="w-4 h-4" />
            Reject
          </button>
        </div>
      ) : null}
    </article>
  );
};

const RequestSection = ({
  title,
  requests,
  emptyMessage,
  busyId,
  onEditCommission,
  onStatusChange,
  onEditTrip,
  onEditExpense,
  onAddExpense,
  onDeleteExpense,
  onEditDailyExpense,
  onAddDailyExpense,
  onDeleteDailyExpense,
}) => (
  <section className="space-y-4">
    <div>
      <h2 className="text-xl font-semibold text-cargo-text">{title}</h2>
    </div>

    {requests.length ? (
      <div className="space-y-4">
        {requests.map((row) => (
          <div key={row.request_id} className="space-y-4">
            <FindingTripExpenseBreakdown
              row={row}
              expenses={row.pending_next_trip_daily_expenses || []}
              totalExpenses={Number(row.pending_next_trip_expenses_total || 0)}
              onEditDailyExpense={onEditDailyExpense}
              onAddDailyExpense={onAddDailyExpense}
              onDeleteDailyExpense={onDeleteDailyExpense}
              title="Waiting For Next Trip Expenses"
              allowAdd
            />
            <RequestCard
              row={row}
              busyId={busyId}
              onEditCommission={onEditCommission}
              onStatusChange={onStatusChange}
              onEditTrip={onEditTrip}
              onEditExpense={onEditExpense}
              onAddExpense={onAddExpense}
              onDeleteExpense={onDeleteExpense}
              onEditDailyExpense={onEditDailyExpense}
              onAddDailyExpense={onAddDailyExpense}
              onDeleteDailyExpense={onDeleteDailyExpense}
            />
          </div>
        ))}
      </div>
    ) : (
      <div className="rounded-xl border border-dashed border-cargo-border bg-cargo-card/30 p-6 text-sm text-cargo-muted">
        {emptyMessage}
      </div>
    )}
  </section>
);

const REQUEST_TABS = [
  { key: 'pending', title: 'Pending Requests', description: 'Requests waiting for review and commission decision.', emptyMessage: 'No pending commission requests.' },
  { key: 'approved', title: 'Approved Requests', description: 'Approved requests stay separate for review history.', emptyMessage: 'No approved commission requests yet.' },
];

const AccountRequestsPage = () => {
  const { get, put, post, del, loading } = useApi();
  const [commissionRequests, setCommissionRequests] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [editingRequest, setEditingRequest] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [activeTab, setActiveTab] = useState('pending');
  const [editingTrip, setEditingTrip] = useState(null);
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
  const [savingTrip, setSavingTrip] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);

  const loadRequests = useCallback(async () => {
    const commissionResult = await get('/admin/driver-commission-requests');
    if (commissionResult.success) {
      setCommissionRequests(commissionResult.data.requests || []);
    }
  }, [get]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleStatusChange = async (requestId, status) => {
    setBusyId(requestId);
    const result = await put(`/admin/driver-commission-requests/${requestId}/status`, { status });
    setBusyId(null);

    if (!result.success) {
      alert(result.error);
      return;
    }

    loadRequests();
  };

  const openCommissionEditModal = (row) => {
    setEditingRequest(row);
    setEditForm({
      commission_percentage: row.commission_percentage ?? '',
      net_profit: row.net_profit ?? row.net_income ?? '',
      commission_amount: row.commission_amount ?? '',
      remarks: row.remarks || '',
    });
  };

  const closeCommissionEditModal = () => {
    setEditingRequest(null);
    setEditForm({});
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    if (!editingRequest?.request_id) return;

    setSavingEdit(true);
    const result = await put(`/admin/driver-commission-requests/${editingRequest.request_id}`, editForm);
    setSavingEdit(false);

    if (!result.success) {
      alert(result.error);
      return;
    }

    closeCommissionEditModal();
    loadRequests();
  };

  const openTripModal = (row) => {
    setEditingTrip(row);
    setTripForm({
      start_meter_reading: row.start_meter_reading ?? '',
      end_meter_reading: row.end_meter_reading ?? '',
      freight_charge: row.freight_charge ?? '',
      from_location: row.from_location || '',
      to_location: row.to_location || '',
      notes: row.notes || '',
    });
  };

  const closeTripModal = () => {
    setEditingTrip(null);
  };

  const handleTripSave = async (e) => {
    e.preventDefault();
    if (!editingTrip?.trip_id) return;

    setSavingTrip(true);
    const result = await put(`/admin/trips/${editingTrip.trip_id}`, tripForm);
    setSavingTrip(false);

    if (!result.success) {
      alert(result.error);
      return;
    }

    closeTripModal();
    loadRequests();
  };

  const openExpenseAddModal = (row) => {
    setExpenseModal({ isOpen: true, tripId: row.trip_id, expenseId: null, type: 'trip', driverId: row.driver_id ?? null });
    setExpenseForm({ category: 'diesel', amount: '', liters: '', location: '', notes: '', expense_date: '', meter_reading: '' });
  };

  const openExpenseEditModal = (row, expense) => {
    setExpenseModal({ isOpen: true, tripId: row.trip_id, expenseId: expense.id, type: 'trip', driverId: row.driver_id ?? null });
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

  const openDailyExpenseAddModal = (row) => {
    setExpenseModal({ isOpen: true, tripId: row.trip_id, expenseId: null, type: 'daily', driverId: row.driver_id ?? null });
    setExpenseForm({ category: 'food', amount: '', liters: '', location: '', notes: '', expense_date: '', meter_reading: '' });
  };

  const openDailyExpenseEditModal = (row, expense) => {
    setExpenseModal({ isOpen: true, tripId: row.trip_id, expenseId: expense.id, type: 'daily', driverId: row.driver_id ?? null });
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
    loadRequests();
  };

  const handleTripExpenseDelete = async (_row, expense) => {
    if (!expense?.id || String(expense.id).startsWith('bilty-') || !window.confirm('Delete this trip expense?')) {
      return;
    }

    const result = await del(`/admin/trip-expenses/${expense.id}`);
    if (!result.success) {
      alert(result.error);
      return;
    }

    loadRequests();
  };

  const handleDailyExpenseDelete = async (_row, expense) => {
    if (!expense?.id || !window.confirm('Delete this daily expense?')) {
      return;
    }

    const result = await del(`/admin/drivers-expenses/${expense.id}`);
    if (!result.success) {
      alert(result.error);
      return;
    }

    loadRequests();
  };

  const pendingRequests = commissionRequests.filter((row) => row.status === 'pending');
  const approvedRequests = commissionRequests.filter((row) => row.status === 'approved');
  const rejectedRequests = commissionRequests.filter((row) => row.status === 'rejected');
  const requestsByTab = { pending: pendingRequests, approved: approvedRequests };
  const activeTabConfig = REQUEST_TABS.find((tab) => tab.key === activeTab) || REQUEST_TABS[0];

  const summary = {
    total: commissionRequests.length,
    pending: pendingRequests.length,
    approved: approvedRequests.length,
    approvedAmount: approvedRequests.reduce((sum, row) => sum + (Number(row.commission_amount) || 0), 0),
  };

  return (
    <>
      <div className="space-y-6 pb-10 max-w-7xl">
        <div className="rounded-xl border border-cargo-border bg-gradient-to-r from-cargo-card to-cargo-dark p-3">
          <h1 className="text-xl font-bold text-cargo-text">Commission Requests Review</h1>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <SummaryCard icon={Receipt} label="Total Requests" value={summary.total.toLocaleString()} />
          <SummaryCard icon={Clock3} label="Pending Review" value={summary.pending.toLocaleString()} tone="text-cargo-accent" />
          <SummaryCard icon={CheckCircle2} label="Approved Requests" value={summary.approved.toLocaleString()} tone="text-cargo-success" />
          <SummaryCard icon={Wallet} label="Approved Amount" value={formatCurrency(summary.approvedAmount)} tone="text-primary-300" />
        </div>

        <div className="rounded-xl border border-cargo-border bg-cargo-card/40 p-3">
          <div className="flex gap-2">
            {REQUEST_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={activeTab === tab.key ? 'btn-primary' : 'btn-secondary'}
              >
                {tab.title}
              </button>
            ))}
          </div>
        </div>

        {loading && !commissionRequests.length ? (
          <div className="flex items-center justify-center h-72">
            <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <RequestSection
              title={activeTabConfig.title}
              description={activeTabConfig.description}
              requests={requestsByTab[activeTab] || []}
              emptyMessage={activeTabConfig.emptyMessage}
              busyId={busyId}
              onEditCommission={openCommissionEditModal}
              onStatusChange={handleStatusChange}
              onEditTrip={openTripModal}
              onEditExpense={openExpenseEditModal}
              onAddExpense={openExpenseAddModal}
              onDeleteExpense={handleTripExpenseDelete}
              onEditDailyExpense={openDailyExpenseEditModal}
              onAddDailyExpense={openDailyExpenseAddModal}
              onDeleteDailyExpense={handleDailyExpenseDelete}
            />

            {rejectedRequests.length ? (
              <RequestSection
                title="Rejected Requests"
                description="Rejected requests are kept separately below for review history."
                requests={rejectedRequests}
                emptyMessage="No rejected commission requests."
                busyId={busyId}
                onEditCommission={openCommissionEditModal}
                onStatusChange={handleStatusChange}
                onEditTrip={openTripModal}
                onEditExpense={openExpenseEditModal}
                onAddExpense={openExpenseAddModal}
                onDeleteExpense={handleTripExpenseDelete}
                onEditDailyExpense={openDailyExpenseEditModal}
                onAddDailyExpense={openDailyExpenseAddModal}
                onDeleteDailyExpense={handleDailyExpenseDelete}
              />
            ) : null}
          </>
        )}
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

      <Modal
        isOpen={expenseModal.isOpen}
        onClose={closeExpenseModal}
        title={expenseModal.type === 'daily' ? (expenseModal.expenseId ? 'Edit While Looking For Next Trip Expense' : 'Add While Looking For Next Trip Expense') : (expenseModal.expenseId ? 'Edit Trip Expense' : 'Add Trip Expense')}
      >
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

      <Modal isOpen={Boolean(editingRequest)} onClose={closeCommissionEditModal} title="Edit Commission Request">
        <form onSubmit={handleEditSave} className="space-y-4">
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

          <textarea
            value={editForm.remarks || ''}
            onChange={(e) => setEditForm((prev) => ({ ...prev, remarks: e.target.value }))}
            className="input-field w-full min-h-24"
            placeholder="Remarks"
          />

          <div className="flex gap-3">
            <button type="button" onClick={closeCommissionEditModal} className="flex-1 btn-secondary">Cancel</button>
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
