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
  Pencil,
  Plus,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { useApi } from '../hooks/useApi';
import Modal from '../components/common/Modal';
import { buildGoogleMapsUrl } from '../utils/maps';

const formatCurrency = (value) => `Rs ${Number(value || 0).toLocaleString()}`;

const formatDate = (value, pattern = 'PP p') => {
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
  if (direction === 'up') return 'text-emerald-400';
  if (direction === 'down') return 'text-rose-400';
  return 'text-slate-400';
};

const formatCategoryLabel = (value) =>
  String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

const sortExpensesByCategory = (expenses = [], orderedCategories = []) =>
  [...expenses].sort((left, right) => {
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

const sortExpenseEntriesForDisplay = (expenses = [], imageKey) =>
  [...expenses].sort((left, right) => {
    const leftHasImage = Boolean(left[imageKey]);
    const rightHasImage = Boolean(right[imageKey]);
    if (leftHasImage !== rightHasImage) return leftHasImage ? -1 : 1;
    return (new Date(left.created_at).getTime() || 0) - (new Date(right.created_at).getTime() || 0);
  });

const groupExpensesByCategory = (expenses = [], orderedCategories = [], imageKey) => {
  const grouped = new Map();
  sortExpensesByCategory(expenses, orderedCategories).forEach((expense) => {
    const key = expense.category || 'other';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(expense);
  });
  return Array.from(grouped.entries()).map(([category, items]) => ({
    category,
    items: sortExpenseEntriesForDisplay(items, imageKey),
    total: items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
  }));
};

const tripExpenseCategories = [
  'diesel',
  'toll',
  'food',
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative flex max-w-5xl w-[90vw] max-h-[90vh] items-center justify-center animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
        <img
          src={src}
          alt={alt}
          className="block max-w-full max-h-[90vh] object-contain object-center rounded-lg shadow-2xl border border-white/10"
        />
        {alt && (
          <p className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs px-4 py-2 rounded-b-lg backdrop-blur-sm">
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
      <div className={`rounded-md border border-dashed border-slate-600 flex items-center justify-center text-[11px] text-slate-500 bg-slate-800/30 ${className}`}>
        No image
      </div>
    );
  }

  return (
    <>
      <div
        className={`relative group cursor-pointer overflow-hidden rounded-md border border-slate-600 ${className}`}
        onClick={() => setIsOpen(true)}
      >
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200 flex items-center justify-center">
          <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 drop-shadow-lg" />
        </div>
      </div>
      <ImageModal src={src} alt={alt} isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
};

const InlineImagePreview = ({ src, alt, className = 'h-14 w-14' }) => (
  <div className="shrink-0">
    <ClickableImage src={src} alt={alt} className={className} />
  </div>
);

const MapLink = ({ coordinates, label = 'Open Map' }) => {
  const href = buildGoogleMapsUrl(coordinates);
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 transition-colors"
    >
      <ExternalLink className="w-3 h-3" />
      {label}
    </a>
  );
};

/* ─── Action Buttons ─── */
const ActionBtn = ({ onClick, icon: Icon, label, variant = 'default' }) => {
  const styles = {
    default: 'bg-sky-500/10 text-sky-400 hover:bg-sky-500/20',
    danger: 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${styles[variant]}`}
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  );
};

const ExpenseBreakdown = ({ trip, onEditExpense, onAddExpense, onDeleteExpense }) => {
  const biltyCommissionAmount = Number(trip.bilty_commission_amount) || 0;
  const hasStoredBiltyCommissionExpense = (trip.expenses || []).some(
    (expense) => expense.category === 'bilty_commission'
  );
  const expenses = sortExpensesByCategory(
    [
      ...(trip.expenses || []),
      ...(!hasStoredBiltyCommissionExpense && biltyCommissionAmount > 0
        ? [
            {
              id: `bilty-${trip.id}`,
              category: 'bilty_commission',
              amount: biltyCommissionAmount,
              created_at: trip.ended_at || trip.started_at,
              location: null,
              liters: null,
              receipt_image: null,
            },
          ]
        : []),
    ],
    tripExpenseCategories
  );
  const effectiveBiltyCommissionAmount = hasStoredBiltyCommissionExpense ? 0 : biltyCommissionAmount;
  const totalExpenses = Number(trip.trip_expenses_total ?? 0) + effectiveBiltyCommissionAmount;
  const groupedExpenses = groupExpensesByCategory(expenses, tripExpenseCategories, 'receipt_image');

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/20 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-200 font-semibold flex items-center gap-2">
          <Receipt className="w-4 h-4 text-slate-400" />
          Expense Breakdown
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onAddExpense(trip)}
            className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-2 py-1 text-xs text-sky-400 hover:bg-sky-500/20 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
                    <p className="text-xl text-rose-600 font-bold px-2 py-1 border border-rose-600 rounded">{formatCurrency(totalExpenses)}</p>

        </div>
      </div>

      {groupedExpenses.length ? (
        <div className="space-y-3">
          {groupedExpenses.map((group) => (
            <div key={group.category} className="rounded-md border border-slate-700/60 bg-slate-800/30 p-2 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-sky-400/60" />
                  <p className="text-xl font-bold">{formatCategoryLabel(group.category)}</p>
                </div>
                <p >{formatCurrency(group.total)}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {group.items.map((expense) => (
                  <div
                    key={expense.id}
                    className="rounded-md bg-slate-800/50 p-2.5 border border-slate-700/40 hover:border-slate-600 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm text-slate-200 font-semibold">{formatCurrency(expense.amount)}</p>
                          <div className="flex items-center gap-1">
                            <ActionBtn onClick={() => onEditExpense(trip, expense)} icon={Pencil} label="Edit" />
                            <ActionBtn onClick={() => onDeleteExpense(trip, expense)} icon={Trash2} label="Del" variant="danger" />
                          </div>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
                          <span>{formatDate(expense.created_at)}</span>
                          {expense.liters ? <span>{Number(expense.liters).toLocaleString()} L</span> : null}
                          {expense.location ? <span>{expense.location}</span> : null}
                        </div>
                      </div>

                      <div className="shrink-0 flex flex-col items-center gap-1">
                        {expense.receipt_image ? (
                          <ClickableImage
                            src={expense.receipt_image}
                            alt={`${expense.category} receipt`}
                            className="h-12 w-12"
                          />
                        ) : null}
                        <MapLink coordinates={expense.coordinates} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-500">No expense entries on this trip.</p>
      )}
    </div>
  );
};

const PendingNextTripExpenseBreakdown = ({
  trip,
  onEditDailyExpense,
  onAddDailyExpense,
  onDeleteDailyExpense,
}) => {
  const expenses = sortExpensesByCategory(
    trip.pending_next_trip_daily_expenses || [],
    dailyExpenseCategories
  );
  const totalExpenses = Number(trip.pending_next_trip_expenses_total ?? 0);
  const groupedExpenses = groupExpensesByCategory(expenses, dailyExpenseCategories, 'expense_image');

  const wastedKm = Number(trip.pending_next_trip_wasted_km ?? 0);

  if (!groupedExpenses.length) return null;

  return (
    <div className="rounded-lg border border-slate-700 bg-rose-500/10 px-2 py-2 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm text-slate-200 font-semibold flex items-center gap-2">
            <Receipt className="w-4 h-4 text-sky-400" />
            Waiting For Next Trip
          </p>
         
          {wastedKm > 0 ? (
            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-rose-600/10  border border-rose-600/20">
              Wasted {wastedKm.toLocaleString()} km
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">

         
          <button
            type="button"
            onClick={() => onAddDailyExpense(trip)}
            className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-2 py-1 text-xs text-sky-400 hover:bg-sky-500/20 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
           <div className="">

                      <p className="text-xl  text-white px-2 py-1 text-rose-600 border border-rose-600 rounded  font-bold">{formatCurrency(totalExpenses)}</p>

          </div>
        </div>
      </div>

      <div className="space-y-3">
        {groupedExpenses.map((group) => (
          <div key={group.category} className="rounded-md border border-slate-700/60 bg-slate-800/30 p-2 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-sky-400/60" />
                <p className="text-xl  font-semibold">{formatCategoryLabel(group.category)}</p>
              </div>
              <p className="text-sm font-bold">{formatCurrency(group.total)}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {group.items.map((expense) => (
                <div
                  key={`pending-${expense.id}`}
                  className="rounded-md bg-slate-800/50 border border-slate-700/40 hover:border-slate-600 transition-colors p-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm text-slate-200 font-semibold">{formatCurrency(expense.amount)}</p>
                        <div className="flex items-center gap-1">
                          <ActionBtn onClick={() => onEditDailyExpense(trip, expense)} icon={Pencil} label="Edit" />
                          <ActionBtn onClick={() => onDeleteDailyExpense(trip, expense)} icon={Trash2} label="Del" variant="danger" />
                        </div>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
                        <span>{formatDate(expense.created_at)}</span>
                        {expense.expense_date ? <span>{formatDate(expense.expense_date, 'PP')}</span> : null}
                        {expense.meter_reading ? <span>Meter: {Number(expense.meter_reading).toLocaleString()}</span> : null}
                      </div>
                    </div>
                    {expense.expense_image ? (
                      <div className="shrink-0 flex flex-col items-center gap-1">
                        <ClickableImage
                          src={expense.expense_image}
                          alt={`${expense.category} expense`}
                          className="h-12 w-12"
                        />
                      </div>
                    ) : null}
                  </div>
                  {expense.note ? <p className="mt-1.5 text-[11px] text-slate-400">{expense.note}</p> : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const StatBadge = ({ children, variant = 'default' }) => {
  const variants = {
    ongoing: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    cancelled: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    default: 'bg-slate-700/40 text-slate-400 border-slate-600/60',
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${variants[variant]}`}>
      {children}
    </span>
  );
};

const TripCard = ({
  trip,
  tripNumber,
  status = 'completed',
  onEditTrip,
  onEditExpense,
  onAddExpense,
  onDeleteExpense,
  onEditDailyExpense,
  onAddDailyExpense,
  onDeleteDailyExpense,
}) => {
  const isOngoing = status === 'ongoing';
  const totalExpenses = Number(trip.total_expenses ?? 0);
  const net = Number(trip.net_income ?? (Number(trip.freight_charge || 0) - totalExpenses));
  const wastedKm = Number(trip.pending_next_trip_wasted_km ?? 0);
  const actualEndLocation = trip.end_location || trip.end_live_location;
  const loadSummary = [trip.load_name, trip.load_weight].filter(Boolean).join(' · ');
  const statusVariant =
    trip.status === 'completed' ? 'completed' : trip.status === 'cancelled' ? 'cancelled' : 'ongoing';
  const varianceTone = getVarianceTone(trip.freight_variance_direction);

  return (
    <article className="rounded-lg border border-slate-700 bg-slate-800/40 p-3 space-y-3 hover:border-slate-600 transition-all duration-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <div
            className={`mt-0.5 p-2 rounded-md ${
              isOngoing
                ? 'bg-sky-500/10'
                : trip.status === 'cancelled'
                ? 'bg-rose-500/30'
                : 'bg-emerald-500/30'
            }`}
          >
            <span
              className={`block min-w-[1rem] text-center text-[14px] font-bold leading-4 ${
                isOngoing
                  ? 'text-slate-300'
                  : trip.status === 'cancelled'
                  ? 'text-slate-300'
                  : 'text-slate-300'
              }`}
            >
              {tripNumber ?? '-'}
            </span>
          </div>
          <div>
            <p className=" font-bold text-base  text-amber-600">
              {trip.from_location} <span className="text-slate-500 font-normal mx-1">→</span> {trip.to_location}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" />
                {trip.driver_name || 'N/A'}
              </span>
              <span className="flex items-center gap-1">
                <Car className="w-3 h-3" />
                {trip.car_number || 'N/A'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatBadge variant={statusVariant}>
            {String(trip.status || 'unknown').charAt(0).toUpperCase() +
              String(trip.status || 'unknown').slice(1)}
          </StatBadge>
          <button
            type="button"
            onClick={() => onEditTrip(trip)}
            className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-2 py-1 text-[11px] text-sky-400 hover:bg-sky-500/20 transition-colors"
          >
            <Pencil className="w-3 h-3" />
            Edit
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-2">
        {[
          { label: 'Started', value: formatDate(trip.started_at), icon: Calendar },
          { label: 'Ended', value: isOngoing ? 'In progress' : formatDate(trip.ended_at), icon: Clock3 },
          {
            label: 'Freight',
            value: formatCurrency(trip.freight_charge),
            subvalue: `↕ ${formatVariancePercent(trip.freight_variance_percentage)}`,
            icon: Wallet,
            tone: varianceTone,
            imageSrc: trip.bilty_slip_image || null,
            imageAlt: 'Bilty slip',
          },
          { label: 'Expenses', value: formatCurrency(totalExpenses), icon: TrendingDown },
          {
            label: 'Distance',
            value: `${Math.max(
              (Number(trip.end_meter_reading) || 0) - (Number(trip.start_meter_reading) || 0),
              0
            ).toLocaleString()} km`,
            subvalue: `Avg: ${formatAverage(trip.trip_average_km_per_liter)}`,
            icon: Activity,
          },
          { label: 'Wasted', value: `${wastedKm.toLocaleString()} km`, icon: Route, tone: wastedKm > 0 ? 'text-rose-400' : 'text-slate-200' },
          { label: 'Net', value: formatCurrency(net), icon: TrendingUp, highlight: true },

        ].map((item) => (
          <div
            key={item.label}
            className={`rounded-md border p-2 text-[11px] font-bold ${
              item.highlight
                ? 'border-emerald-500/20 bg-emerald-500/5'
                : 'border-slate-700 bg-slate-800/30'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                  <item.icon className="w-3 h-3" />
                  {item.label}
                </p>
                <p
                  className={`text-sm font-semibold mt-1 ${
                    item.highlight ? 'text-emerald-400' : item.tone || 'text-slate-200'
                  }`}
                >
                  {item.value}
                </p>
                {item.subvalue ? (
                  <p className={`text-[11px] mt-0.5 ${item.tone || 'text-slate-500'}`}>{item.subvalue}</p>
                ) : null}
              </div>
              {item.imageSrc ? (
                <ClickableImage src={item.imageSrc} alt={item.imageAlt || item.label} className="h-12 w-12 shrink-0" />
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {/* Meter & Location Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
        <div className="rounded-md border border-slate-700 bg-slate-800/30 p-2.5 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[13px] text-slate-300 uppercase tracking-wider font-bold flex items-center gap-1">
              <Gauge className="w-3 h-3" />
              Start Meter
            </p>
            <p className="text-sm text-slate-200 font-semibold mt-1">{(trip.start_meter_reading || 0).toLocaleString()}</p>
            <p className="text-sm text-slate-400 mt-0.5">{trip.start_live_location || trip.from_location || 'N/A'}</p>
          </div>
          <div className="shrink-0 flex flex-col items-center gap-1">
            <InlineImagePreview src={trip.start_meter_image} alt="Start meter" className="h-12 w-12" />
            <MapLink coordinates={trip.start_coordinates} />
          </div>
        </div>

        <div className="rounded-md border border-slate-700 bg-slate-800/30 p-2.5 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] text-slate-300 uppercase tracking-wider font-bold flex items-center gap-1">
              <Gauge className="w-3 h-3" />
              End Meter
            </p>
            <p className="text-sm text-slate-200 font-semibold mt-1">
              {trip.end_meter_reading ? trip.end_meter_reading.toLocaleString() : isOngoing ? 'Pending' : 'N/A'}
            </p>
            <p className="text-sm text-slate-400 mt-0.5">{actualEndLocation || (isOngoing ? 'In progress' : 'N/A')}</p>
          </div>
          <div className="shrink-0 flex flex-col items-center gap-1">
            <InlineImagePreview src={trip.end_meter_image} alt="End meter" className="h-12 w-12" />
            <MapLink coordinates={trip.end_coordinates} />
          </div>
        </div>

       <div className="rounded-md border border-slate-700 bg-slate-800/30 p-2.5 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xl text-slate-300 uppercase tracking-wider font-bold">Load <span className='text-xl'>{loadSummary || 'N/A'}</span> Ton</p>
            <p className="text-sm text-slate-400 mt-0.5">{trip.load_live_location || 'No load location'}</p>
            <MapLink coordinates={trip.load_coordinates} />
          </div>
          <InlineImagePreview src={trip.load_photo} alt="Load photo" className="h-12 w-12" />
        </div>
       
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 bg-dark">
        

        <div className="rounded-md border border-slate-700 bg-slate-800/30 p-2.5">
          <p className="text-[11px] text-slate-300 uppercase tracking-wider font-bold">Expected Freight</p>
          <p className="text-sm text-slate-200 font-semibold mt-1">
            {trip.expected_freight_charge ? formatCurrency(trip.expected_freight_charge) : 'N/A'}
          </p>
        </div>

        <div className="rounded-md border border-slate-700 bg-slate-800/30 p-2.5">
          <p className="text-[11px] text-slate-300 uppercase tracking-wider font-bold">Variance</p>
          <p className={`text-sm font-semibold mt-1 ${varianceTone}`}>
            {trip.freight_variance_amount !== null && trip.freight_variance_amount !== undefined
              ? formatCurrency(trip.freight_variance_amount)
              : 'N/A'}
          </p>
        </div>
      </div>

      

      <ExpenseBreakdown
        trip={trip}
        onEditExpense={onEditExpense}
        onAddExpense={onAddExpense}
        onDeleteExpense={onDeleteExpense}
      />

      {trip.notes ? (
        <div className="rounded-md border border-slate-700 bg-slate-800/30 p-3">
          <p className="text-[11px] text-slate-300 uppercase tracking-wider font-bold flex items-center gap-1 mb-1.5">
            <FileText className="w-3 h-3" />
            Notes
          </p>
          <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{trip.notes}</p>
        </div>
      ) : null}
    </article>
  );
};

const SummaryCard = ({ title, value, icon, highlight = false }) => {
  const IconComponent = icon;

  return (
    <div
      className={`rounded-lg border p-3 hover:border-slate-600 transition-all duration-200 ${
        highlight ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-slate-700 bg-slate-800/40'
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-400 font-medium">{title}</p>
          <p className={`text-xl font-bold mt-1.5 ${highlight ? 'text-emerald-400' : 'text-slate-200'}`}>{value}</p>
        </div>
        <div className={`p-2 rounded-md ${highlight ? 'bg-emerald-500/10' : 'bg-slate-700/30'}`}>
          <IconComponent className={`w-4 h-4 ${highlight ? 'text-emerald-400' : 'text-slate-400'}`} />
        </div>
      </div>
    </div>
  );
};

const CarReportPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { get, post, put, del, loading } = useApi();
  const [reportData, setReportData] = useState(null);
  const [filters, setFilters] = useState({
    period: 'all',
    from_date: '',
    to_date: '',
  });
  const [editingTrip, setEditingTrip] = useState(null);
  const [tripForm, setTripForm] = useState({
    start_meter_reading: '',
    end_meter_reading: '',
    freight_charge: '',
    from_location: '',
    to_location: '',
    notes: '',
  });
  const [expenseModal, setExpenseModal] = useState({
    isOpen: false,
    tripId: null,
    expenseId: null,
    type: 'trip',
    driverId: null,
  });
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

  const fetchReport = useCallback(
    async (activeFilters = filters) => {
      const params = { period: activeFilters.period };
      if (activeFilters.from_date) params.from_date = activeFilters.from_date;
      if (activeFilters.to_date) params.to_date = activeFilters.to_date;

      const result = await get(`/admin/cars/${id}/history`, { params });
      if (result.success) {
        setReportData(result.data);
      } else {
        alert(result.error);
      }
    },
    [get, id, filters]
  );

  useEffect(() => {
    fetchReport({ period: 'all', from_date: '', to_date: '' });
  }, [id, fetchReport]);

  const trips = reportData?.trips || [];
  const ongoingTrips = useMemo(() => trips.filter((trip) => trip.status === 'ongoing'), [trips]);
  const completedTrips = useMemo(() => trips.filter((trip) => trip.status === 'completed'), [trips]);

  const openTripModal = (trip) => {
    setEditingTrip(trip);
    setTripForm({
      start_meter_reading: trip.start_meter_reading ?? '',
      end_meter_reading: trip.end_meter_reading ?? '',
      freight_charge: trip.freight_charge ?? '',
      from_location: trip.from_location || '',
      to_location: trip.to_location || '',
      notes: trip.notes || '',
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
    fetchReport(filters);
  };

  const openExpenseAddModal = (trip) => {
    setExpenseModal({
      isOpen: true,
      tripId: trip.id,
      expenseId: null,
      type: 'trip',
      driverId: trip.driver_id ?? null,
    });
    setExpenseForm({
      category: 'diesel',
      amount: '',
      liters: '',
      location: '',
      notes: '',
      expense_date: '',
      meter_reading: '',
    });
  };

  const openExpenseEditModal = (trip, expense) => {
    setExpenseModal({
      isOpen: true,
      tripId: trip.id,
      expenseId: expense.id,
      type: 'trip',
      driverId: trip.driver_id ?? null,
    });
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

  const openDailyExpenseAddModal = (trip) => {
    setExpenseModal({
      isOpen: true,
      tripId: trip.id,
      expenseId: null,
      type: 'daily',
      driverId: trip.driver_id ?? null,
    });
    setExpenseForm({
      category: 'food',
      amount: '',
      liters: '',
      location: '',
      notes: '',
      expense_date: '',
      meter_reading: '',
    });
  };

  const openDailyExpenseEditModal = (trip, expense) => {
    setExpenseModal({
      isOpen: true,
      tripId: trip.id,
      expenseId: expense.id,
      type: 'daily',
      driverId: trip.driver_id ?? null,
    });
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

  const closeExpenseModal = () =>
    setExpenseModal({ isOpen: false, tripId: null, expenseId: null, type: 'trip', driverId: null });

  const handleExpenseSave = async (e) => {
    e.preventDefault();
    setSavingExpense(true);
    const payload =
      expenseModal.type === 'daily'
        ? {
            driver_id: expenseModal.driverId,
            category: expenseForm.category,
            amount: expenseForm.amount,
            note: expenseForm.notes,
            expense_date: expenseForm.expense_date,
            meter_reading: expenseForm.meter_reading,
          }
        : expenseForm;
    const result =
      expenseModal.type === 'daily'
        ? expenseModal.expenseId
          ? await put(`/admin/drivers-expenses/${expenseModal.expenseId}`, payload)
          : await post('/admin/drivers-expenses', payload)
        : expenseModal.expenseId
        ? await put(`/admin/trip-expenses/${expenseModal.expenseId}`, payload)
        : await post(`/admin/trips/${expenseModal.tripId}/expenses`, payload);
    setSavingExpense(false);

    if (!result.success) {
      alert(result.error);
      return;
    }
    closeExpenseModal();
    fetchReport(filters);
  };

  const handleTripExpenseDelete = async (_trip, expense) => {
    if (!expense?.id || !window.confirm('Delete this trip expense?')) return;
    const result = await del(`/admin/trip-expenses/${expense.id}`);
    if (!result.success) {
      alert(result.error);
      return;
    }
    fetchReport(filters);
  };

  const handleDailyExpenseDelete = async (_trip, expense) => {
    if (!expense?.id || !window.confirm('Delete this daily expense?')) return;
    const result = await del(`/admin/drivers-expenses/${expense.id}`);
    if (!result.success) {
      alert(result.error);
      return;
    }
    fetchReport(filters);
  };

  return (
    <div className="space-y-4 pb-8 max-w-7xl">
      {/* Header */}
      <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/cars')}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-700/50 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <h1 className="text-xl font-bold text-slate-200 flex items-center gap-2.5">
            <div className="p-1.5 rounded-md bg-sky-500/10">
              <Car className="w-5 h-5 text-sky-400" />
            </div>
            Cargo Report {reportData?.car?.car_number ? `- ${reportData.car.car_number}` : ''}
          </h1>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-3 grid grid-cols-1 md:grid-cols-4 gap-2">
        <div className="md:col-span-2 flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={filters.period}
            onChange={(e) => setFilters((prev) => ({ ...prev, period: e.target.value }))}
            className="w-full rounded-md border border-slate-600 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
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
          className="w-full rounded-md border border-slate-600 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
        <input
          type="date"
          value={filters.to_date}
          onChange={(e) => setFilters((prev) => ({ ...prev, to_date: e.target.value }))}
          className="w-full rounded-md border border-slate-600 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
        <button
          type="button"
          onClick={() => fetchReport(filters)}
          className="md:col-span-4 w-full rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 transition-colors"
        >
          Apply Filter
        </button>
      </div>

      {loading && !reportData ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-7 h-7 border-3 border-sky-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <SummaryCard
              title="Total Revenue"
              value={formatCurrency(reportData?.summary?.total_revenue)}
              icon={TrendingUp}
            />
            <SummaryCard
              title="Total Expenses"
              value={formatCurrency(reportData?.summary?.total_expenses)}
              icon={TrendingDown}
            />
            <SummaryCard
              title="Net Income"
              value={formatCurrency(reportData?.summary?.net_income)}
              icon={Wallet}
              highlight
            />
            <SummaryCard
              title="Trips / Distance"
              value={`${reportData?.summary?.total_trips || 0} / ${(
                reportData?.summary?.total_distance || 0
              ).toLocaleString()} km`}
              icon={Activity}
            />
          </div>

          {/* Current Assignment + Trip Status */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="rounded-lg border border-slate-700 bg-slate-800/40 px-4 py-2 lg:col-span-2">
              <h2 className="text-base font-semibold text-slate-200 mb-3 flex items-center gap-2">
                <User className="w-4 h-4 text-slate-400" />
                Current Assignment
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  {
                    label: 'Current Driver',
                    value: reportData?.car?.current_driver_name || 'No active driver',
                  },
                  { label: 'Phone', value: reportData?.car?.current_driver_phone || 'N/A' },
                  {
                    label: 'Current Meter',
                    value: `${(reportData?.car?.current_meter_reading || 0).toLocaleString()} km`,
                  },
                  {
                    label: 'Overall Avg',
                    value: formatAverage(
                      reportData?.car?.overall_average_km_per_liter ||
                        reportData?.summary?.overall_average_km_per_liter
                    ),
                  },
                ].map((item) => (
                  <div key={item.label} className="rounded-md border border-slate-700 bg-slate-800/30 p-3">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">{item.label}</p>
                    <p className="text-sm text-slate-200 mt-1.5 font-semibold">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-800/40 px-4 py-2">
              <h2 className="text-base font-semibold text-slate-200 mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4 text-slate-400" />
                Trip Status
              </h2>
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-md border border-sky-500/20 bg-sky-500/5 p-3">
                  <div className="flex items-center gap-2 text-sky-400">
                    <Clock3 className="w-4 h-4" />
                    <span className="text-sm font-medium">Ongoing</span>
                  </div>
                  <span className="text-slate-200 font-bold text-base">{ongoingTrips.length}</span>
                </div>
                <div className="flex items-center justify-between rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-sm font-medium">Completed</span>
                  </div>
                  <span className="text-slate-200 font-bold text-base">{completedTrips.length}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Driver Assignment History */}
          <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-4">
            <h2 className="text-base font-semibold text-slate-200 mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              Driver Assignment History
            </h2>
            {reportData?.assignments?.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {reportData.assignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    className="rounded-md border border-slate-700 bg-slate-800/30 p-3 space-y-1.5 hover:border-slate-600 transition-colors"
                  >
                    <p className="text-sm text-slate-200 font-semibold flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      {assignment.driver_name}
                    </p>
                    <div className="flex flex-col gap-0.5">
                      <p className="text-xs text-slate-400">
                        <span className="text-slate-500">Assigned:</span> {formatDate(assignment.assigned_at)}
                      </p>
                      <p className="text-xs text-slate-400">
                        <span className="text-slate-500">Unassigned:</span>{' '}
                        {assignment.unassigned_at ? (
                          formatDate(assignment.unassigned_at)
                        ) : (
                          <span className="text-sky-400 font-medium">Currently assigned</span>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No assignment history found.</p>
            )}
          </div>

          {/* Ongoing Trips */}
          <div className="space-y-3">
            <h2 className="text-base font-semibold text-slate-200 flex items-center gap-2">
              <Clock3 className="w-4 h-4 text-sky-400" />
              Ongoing Trips
            </h2>
            {ongoingTrips.length ? (
              ongoingTrips.map((trip, index) => (
                <TripCard
                  key={trip.id}
                  trip={trip}
                  tripNumber={index + 1}
                  status="ongoing"
                  onEditTrip={openTripModal}
                  onEditExpense={openExpenseEditModal}
                  onAddExpense={openExpenseAddModal}
                  onDeleteExpense={handleTripExpenseDelete}
                  onEditDailyExpense={openDailyExpenseEditModal}
                  onAddDailyExpense={openDailyExpenseAddModal}
                  onDeleteDailyExpense={handleDailyExpenseDelete}
                />
              ))
            ) : (
              <p className="text-sm text-slate-500">No ongoing trips in this period.</p>
            )}
          </div>

          {/* Completed Trips */}
          <div className="space-y-3">
            <h2 className="text-base font-semibold text-slate-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Completed Trip Records
            </h2>
            {completedTrips.length ? (
              completedTrips.map((trip, index) => (
                <div key={trip.id} className="space-y-3">
                  <PendingNextTripExpenseBreakdown
                    trip={trip}
                    onEditDailyExpense={openDailyExpenseEditModal}
                    onAddDailyExpense={openDailyExpenseAddModal}
                    onDeleteDailyExpense={handleDailyExpenseDelete}
                  />
                  <TripCard
                    trip={trip}
                      tripNumber={trips.length - index}
                    status="completed"
                    onEditTrip={openTripModal}
                    onEditExpense={openExpenseEditModal}
                    onAddExpense={openExpenseAddModal}
                    onDeleteExpense={handleTripExpenseDelete}
                    onEditDailyExpense={openDailyExpenseEditModal}
                    onAddDailyExpense={openDailyExpenseAddModal}
                    onDeleteDailyExpense={handleDailyExpenseDelete}
                  />
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No completed trips in this period.</p>
            )}
          </div>
        </>
      )}

      {/* Edit Trip Modal */}
      <Modal isOpen={Boolean(editingTrip)} onClose={closeTripModal} title="Edit Trip">
        <form onSubmit={handleTripSave} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              value={tripForm.start_meter_reading}
              onChange={(e) => setTripForm((prev) => ({ ...prev, start_meter_reading: e.target.value }))}
              className="w-full rounded-md border border-slate-600 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
              placeholder="Start Meter Reading"
            />
            <input
              type="number"
              min="0"
              step="0.01"
              value={tripForm.end_meter_reading}
              onChange={(e) => setTripForm((prev) => ({ ...prev, end_meter_reading: e.target.value }))}
              className="w-full rounded-md border border-slate-600 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
              placeholder="End Meter Reading"
            />
            <input
              type="text"
              value={tripForm.from_location}
              onChange={(e) => setTripForm((prev) => ({ ...prev, from_location: e.target.value }))}
              className="w-full rounded-md border border-slate-600 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
              placeholder="From Location"
            />
            <input
              type="text"
              value={tripForm.to_location}
              onChange={(e) => setTripForm((prev) => ({ ...prev, to_location: e.target.value }))}
              className="w-full rounded-md border border-slate-600 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
              placeholder="To Location"
            />
            <input
              type="number"
              min="0"
              step="0.01"
              value={tripForm.freight_charge}
              onChange={(e) => setTripForm((prev) => ({ ...prev, freight_charge: e.target.value }))}
              className="w-full md:col-span-2 rounded-md border border-slate-600 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
              placeholder="Freight Charge"
            />
          </div>
          <textarea
            value={tripForm.notes}
            onChange={(e) => setTripForm((prev) => ({ ...prev, notes: e.target.value }))}
            className="w-full rounded-md border border-slate-600 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500 min-h-20"
            placeholder="Notes"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={closeTripModal}
              className="flex-1 rounded-md border border-slate-600 bg-slate-700/50 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingTrip}
              className="flex-1 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 transition-colors disabled:opacity-50"
            >
              {savingTrip ? 'Saving...' : 'Save Trip'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Expense Modal */}
      <Modal
        isOpen={expenseModal.isOpen}
        onClose={closeExpenseModal}
        title={
          expenseModal.type === 'daily'
            ? expenseModal.expenseId
              ? 'Edit Waiting Expense'
              : 'Add Waiting Expense'
            : expenseModal.expenseId
            ? 'Edit Trip Expense'
            : 'Add Trip Expense'
        }
      >
        <form onSubmit={handleExpenseSave} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <select
              value={expenseForm.category}
              onChange={(e) => setExpenseForm((prev) => ({ ...prev, category: e.target.value }))}
              className="w-full rounded-md border border-slate-600 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              {(expenseModal.type === 'daily' ? dailyExpenseCategories : tripExpenseCategories).map((category) => (
                <option key={category} value={category}>
                  {formatCategoryLabel(category)}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              step="0.01"
              value={expenseForm.amount}
              onChange={(e) => setExpenseForm((prev) => ({ ...prev, amount: e.target.value }))}
              className="w-full rounded-md border border-slate-600 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
              placeholder="Amount"
            />
            {expenseModal.type === 'daily' ? (
              <>
                <input
                  type="date"
                  value={expenseForm.expense_date}
                  onChange={(e) => setExpenseForm((prev) => ({ ...prev, expense_date: e.target.value }))}
                  className="w-full rounded-md border border-slate-600 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={expenseForm.meter_reading}
                  onChange={(e) => setExpenseForm((prev) => ({ ...prev, meter_reading: e.target.value }))}
                  className="w-full rounded-md border border-slate-600 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  placeholder="Meter Reading"
                />
              </>
            ) : (
              <>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={expenseForm.liters}
                  onChange={(e) => setExpenseForm((prev) => ({ ...prev, liters: e.target.value }))}
                  className="w-full rounded-md border border-slate-600 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  placeholder="Liters"
                />
                <input
                  type="text"
                  value={expenseForm.location}
                  onChange={(e) => setExpenseForm((prev) => ({ ...prev, location: e.target.value }))}
                  className="w-full rounded-md border border-slate-600 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  placeholder="Location"
                />
              </>
            )}
          </div>
          <textarea
            value={expenseForm.notes}
            onChange={(e) => setExpenseForm((prev) => ({ ...prev, notes: e.target.value }))}
            className="w-full rounded-md border border-slate-600 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500 min-h-20"
            placeholder={expenseModal.type === 'daily' ? 'Name / Notes' : 'Notes'}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={closeExpenseModal}
              className="flex-1 rounded-md border border-slate-600 bg-slate-700/50 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingExpense}
              className="flex-1 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 transition-colors disabled:opacity-50"
            >
              {savingExpense ? 'Saving...' : expenseModal.expenseId ? 'Save Expense' : 'Add Expense'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default CarReportPage;
