import { useEffect, useMemo, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { format } from 'date-fns';
import {
  Route,
  Clock,
  MapPin,
  Activity,
  Car,
  User,
  Wallet,
  TrendingDown,
  TrendingUp,
  ArrowRight,
  ChevronRight,
  Eye,
  CalendarDays,
  Package,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const formatCurrency = (value) => `Rs ${Number(value || 0).toLocaleString()}`;

const STATUS_CONFIG = {
  ongoing: {
    label: 'Ongoing',
    color: 'text-sky-400',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/20',
    dot: 'bg-sky-400',
    icon: Clock,
  },
  completed: {
    label: 'Completed',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    dot: 'bg-emerald-400',
    icon: Activity,
  },
  cancelled: {
    label: 'Cancelled',
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/20',
    dot: 'bg-rose-400',
    icon: Package,
  },
};

const TripMonitor = () => {
  const { get, loading } = useApi();
  const [trips, setTrips] = useState([]);
  const [filter, setFilter] = useState('all');
  const navigate = useNavigate();

  const fetchTrips = async () => {
    const result = await get('/admin/dashboard');
    if (result.success) {
      setTrips(result.data.recentTrips || []);
    }
  };

  useEffect(() => {
    fetchTrips();
  }, []);

  const orderedTrips = useMemo(
    () => [...trips].sort((left, right) => (Number(right.id) || 0) - (Number(left.id) || 0)),
    [trips]
  );

  const filteredTrips = orderedTrips.filter((trip) => {
    if (filter === 'all') return true;
    return trip.status === filter;
  });

  const ongoingCount = trips.filter((t) => t.status === 'ongoing').length;
  const completedCount = trips.filter((t) => t.status === 'completed').length;

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 border border-slate-700">
            <Route className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Trip Monitor</h1>
            <p className="text-sm text-slate-500">Live trip tracking</p>
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-slate-900 border border-slate-800 p-1">
          {['all', 'ongoing', 'completed'].map((tab) => {
            const isActive = filter === tab;
            const activeStyles =
              tab === 'ongoing'
                ? 'bg-sky-500/10 text-sky-400'
                : tab === 'completed'
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-slate-800 text-slate-200';
            return (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                  isActive ? activeStyles : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {tab}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-3">
          <div className="flex items-center gap-2 text-slate-500 mb-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">Ongoing</span>
          </div>
          <p className="text-2xl font-bold text-slate-100">{ongoingCount}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-3">
          <div className="flex items-center gap-2 text-slate-500 mb-1.5">
            <Activity className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">Completed</span>
          </div>
          <p className="text-2xl font-bold text-slate-100">{completedCount}</p>
        </div>
      </div>

      {/* Trips List */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-7 h-7 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTrips.map((trip) => {
            const cfg = STATUS_CONFIG[trip.status] || STATUS_CONFIG.ongoing;
            const StatusIcon = cfg.icon;
            const net = trip.net_profit !== undefined ? Number(trip.net_profit) : null;

            return (
              <div
                key={trip.id}
                className="rounded-lg border border-slate-800 bg-slate-700/40 p-3 hover:border-slate-700 transition-colors cursor-pointer"
                onClick={() => navigate(`/trips/${trip.id}/report`)}
              >
                {/* Card Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${cfg.bg} border ${cfg.border}`}>
                      <StatusIcon className={`w-4 h-4 ${cfg.color}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-100 truncate">{trip.from_location}</span>
                        <ArrowRight className="w-3 h-3 text-slate-600 shrink-0" />
                        <span className="text-sm font-semibold text-slate-100 truncate">{trip.to_location}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
                          <div className={`w-1 h-1 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </span>
                        <span className="text-[10px] text-slate-600 flex items-center gap-1">
                          <CalendarDays className="w-3 h-3" />
                          {format(new Date(trip.started_at), 'MMM d, HH:mm')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600 shrink-0 mt-1" />
                </div>

                {/* Card Body - Mobile optimized grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="rounded-md bg-slate-950/30 border border-slate-800/60 p-2">
                    <div className="flex items-center gap-1 text-[10px] text-slate-500 mb-0.5">
                      <User className="w-3 h-3" />
                      Driver
                    </div>
                    <p className="text-sm font-medium text-slate-200 truncate">{trip.driver_name || 'N/A'}</p>
                  </div>

                  <div className="rounded-md bg-slate-950/30 border border-slate-800/60 p-2">
                    <div className="flex items-center gap-1 text-[10px] text-slate-500 mb-0.5">
                      <Car className="w-3 h-3" />
                      Vehicle
                    </div>
                    <p className="text-sm font-medium text-slate-200 truncate">{trip.car_number || 'N/A'}</p>
                  </div>

                  <div className="rounded-md bg-slate-950/30 border border-slate-800/60 p-2">
                    <div className="flex items-center gap-1 text-[10px] text-slate-500 mb-0.5">
                      <Wallet className="w-3 h-3" />
                      Revenue
                    </div>
                    <p className="text-sm font-semibold text-slate-200">{formatCurrency(trip.freight_charge)}</p>
                  </div>

                  <div className="rounded-md bg-slate-950/30 border border-slate-800/60 p-2">
                    <div className="flex items-center gap-1 text-[10px] text-slate-500 mb-0.5">
                      <TrendingDown className="w-3 h-3" />
                      Expenses
                    </div>
                    <p className="text-sm font-semibold text-slate-200">
                      {trip.total_expenses !== undefined ? formatCurrency(trip.total_expenses) : 'N/A'}
                    </p>
                  </div>
                </div>

                {/* Net + View row */}
                <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-slate-800">
                 
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/trips/${trip.id}/report`);
                    }}
                    className="w-full flex items-center justify-center  gap-1.5 rounded-md bg-sky-500/10 border border-sky-500/20 px-2.5 py-2 text-[14px] font-medium text-sky-400 hover:bg-sky-500/20 transition-colors"
                  >
                    <Eye className="w-3 h-3" />
                    View
                  </button>
                </div>
              </div>
            );
          })}

          {filteredTrips.length === 0 && (
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-8 text-center">
              <Route className="w-8 h-8 text-slate-700 mx-auto mb-2" />
              <p className="text-sm text-slate-600">No trips found</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TripMonitor;