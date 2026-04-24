import { useEffect, useMemo, useState } from 'react';
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

const ExpenseBreakdown = ({ trip }) => {
  const expenses = trip.expenses || [];

  return (
    <div className="rounded-lg border border-cargo-border bg-cargo-dark/40 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-cargo-text font-medium">Expense Breakdown</p>
        <p className="text-sm text-cargo-muted">Total: {formatCurrency(trip.total_expenses)}</p>
      </div>

      {expenses.length ? (
        <div className="space-y-2">
          {expenses.map((expense) => (
            <div key={expense.id} className="rounded-md border border-cargo-border/70 p-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-cargo-text capitalize">{expense.category}</p>
                <p className="text-sm text-cargo-text font-medium">{formatCurrency(expense.amount)}</p>
              </div>
              {expense.receipt_image ? (
                <img
                  src={expense.receipt_image}
                  alt={`${expense.category} receipt`}
                  className="mt-2 h-24 w-full rounded-md object-cover border border-cargo-border"
                />
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

const MeterImageCard = ({ label, src, alt }) => (
  <div>
    <p className="text-xs text-cargo-muted mb-1">{label}</p>
    {src ? (
      <img src={src} alt={alt} className="h-36 w-full rounded-lg object-cover border border-cargo-border" />
    ) : (
      <div className="h-36 rounded-lg border border-dashed border-cargo-border flex items-center justify-center text-xs text-cargo-muted">
        No image
      </div>
    )}
  </div>
);

const TripCard = ({ trip, status = 'completed' }) => {
  const isOngoing = status === 'ongoing';
  const actualEndLocation = trip.end_location || trip.end_live_location;

  return (
    <article className="rounded-xl border border-cargo-border bg-cargo-card/60 p-4 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <p className="text-cargo-text font-semibold flex items-center gap-2">
            <MapPin className={`w-4 h-4 ${isOngoing ? 'text-cargo-accent' : 'text-cargo-success'}`} />
            {trip.from_location} to {trip.to_location}
          </p>
          <p className="text-xs text-cargo-muted mt-1">Driver: {trip.driver_name || 'N/A'}</p>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
            isOngoing ? 'bg-cargo-accent/20 text-cargo-accent' : 'bg-cargo-success/20 text-cargo-success'
          }`}
        >
          {isOngoing ? 'Ongoing' : 'Completed'}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="rounded-lg border border-cargo-border p-3">
          <p className="text-xs text-cargo-muted">Started</p>
          <p className="text-sm text-cargo-text mt-1">{formatDate(trip.started_at)}</p>
        </div>
        <div className="rounded-lg border border-cargo-border p-3">
          <p className="text-xs text-cargo-muted">Ended</p>
          <p className="text-sm text-cargo-text mt-1">{isOngoing ? 'In progress' : formatDate(trip.ended_at)}</p>
        </div>
        <div className="rounded-lg border border-cargo-border p-3">
          <p className="text-xs text-cargo-muted">Freight</p>
          <p className="text-sm text-cargo-text mt-1">{formatCurrency(trip.freight_charge)}</p>
        </div>
        <div className="rounded-lg border border-cargo-border p-3">
          <p className="text-xs text-cargo-muted">Expenses</p>
          <p className="text-sm text-cargo-text mt-1">{formatCurrency(trip.total_expenses)}</p>
        </div>
        <div className="rounded-lg border border-cargo-border p-3">
          <p className="text-xs text-cargo-muted">Net</p>
          <p className="text-sm text-cargo-success mt-1">{formatCurrency(trip.net_income)}</p>
        </div>
        <div className="rounded-lg border border-cargo-border p-3">
          <p className="text-xs text-cargo-muted">Distance</p>
          <p className="text-sm text-cargo-text mt-1">{Math.max((trip.end_meter_reading || 0) - (trip.start_meter_reading || 0), 0).toLocaleString()} km</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-lg border border-cargo-border p-3">
          <p className="text-xs text-cargo-muted flex items-center gap-1"><Gauge className="w-3 h-3" />Start Meter Reading</p>
          <p className="text-sm text-cargo-text mt-1">{(trip.start_meter_reading || 0).toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-cargo-border p-3">
          <p className="text-xs text-cargo-muted flex items-center gap-1"><Gauge className="w-3 h-3" />End Meter Reading</p>
          <p className="text-sm text-cargo-text mt-1">{trip.end_meter_reading ? trip.end_meter_reading.toLocaleString() : isOngoing ? 'Pending' : 'N/A'}</p>
        </div>
        <div className="rounded-lg border border-cargo-border p-3">
          <p className="text-xs text-cargo-muted">Live Start Location</p>
          <p className="text-sm text-cargo-text mt-1">{trip.start_live_location || trip.from_location || 'N/A'}</p>
        </div>
        <div className="rounded-lg border border-cargo-border p-3">
          <p className="text-xs text-cargo-muted">Actual End Location</p>
          <p className="text-sm text-cargo-text mt-1">{actualEndLocation || (isOngoing ? 'In progress' : 'N/A')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <MeterImageCard label="Start Meter Photo" src={trip.start_meter_image} alt="Start meter" />
        <MeterImageCard label="End Meter Photo" src={trip.end_meter_image} alt="End meter" />
        <MeterImageCard label="Bilty Slip" src={trip.bilty_slip_image} alt="Bilty slip" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-lg border border-cargo-border p-3">
          <p className="text-xs text-cargo-muted">Bilty Commission</p>
          <p className="text-sm text-cargo-text mt-1">{formatCurrency(trip.bilty_commission_amount)}</p>
        </div>
        <div className="rounded-lg border border-cargo-border p-3">
          <p className="text-xs text-cargo-muted">Police Cost</p>
          <p className="text-sm text-cargo-text mt-1">{formatCurrency((trip.expenses || []).filter((item) => item.category === 'police').reduce((sum, item) => sum + Number(item.amount || 0), 0))}</p>
        </div>
        <div className="rounded-lg border border-cargo-border p-3">
          <p className="text-xs text-cargo-muted">Chalaan Cost</p>
          <p className="text-sm text-cargo-text mt-1">{formatCurrency((trip.expenses || []).filter((item) => item.category === 'chalaan').reduce((sum, item) => sum + Number(item.amount || 0), 0))}</p>
        </div>
        <div className="rounded-lg border border-cargo-border p-3">
          <p className="text-xs text-cargo-muted">Reward Cost</p>
          <p className="text-sm text-cargo-text mt-1">{formatCurrency((trip.expenses || []).filter((item) => item.category === 'reward').reduce((sum, item) => sum + Number(item.amount || 0), 0))}</p>
        </div>
      </div>

      <ExpenseBreakdown trip={trip} />

      {trip.notes ? (
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/40 p-3">
          <p className="text-xs text-cargo-muted flex items-center gap-1"><FileText className="w-3 h-3" />Notes</p>
          <p className="text-sm text-cargo-text mt-1 whitespace-pre-wrap">{trip.notes}</p>
        </div>
      ) : null}
    </article>
  );
};

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

  const fetchReport = async (activeFilters = filters) => {
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
  };

  useEffect(() => {
    fetchReport({ period: 'all', from_date: '', to_date: '' });
  }, [id]);

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
      <div className="rounded-xl border border-cargo-border bg-gradient-to-r from-cargo-card to-cargo-dark p-4 md:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/cars')}
            className="btn-secondary flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div>
            <h1 className="text-2xl font-bold text-cargo-text flex items-center gap-2">
              <Car className="w-6 h-6 text-primary-400" />
              Cargo Report {reportData?.car?.car_number ? `- ${reportData.car.car_number}` : ''}
            </h1>
            <p className="text-cargo-muted mt-1">Detailed route, expense, and meter audit per trip</p>
          </div>
        </div>
      </div>

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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="card">
              <p className="text-sm text-cargo-muted">Total Revenue</p>
              <p className="text-2xl font-bold text-cargo-text mt-1">{formatCurrency(reportData?.summary?.total_revenue)}</p>
            </div>
            <div className="card">
              <p className="text-sm text-cargo-muted">Total Expenses</p>
              <p className="text-2xl font-bold text-cargo-text mt-1">{formatCurrency(reportData?.summary?.total_expenses)}</p>
            </div>
            <div className="card">
              <p className="text-sm text-cargo-muted">Net Income</p>
              <p className="text-2xl font-bold text-cargo-text mt-1">{formatCurrency(reportData?.summary?.net_income)}</p>
            </div>
            <div className="card">
              <p className="text-sm text-cargo-muted">Trips / Distance</p>
              <p className="text-2xl font-bold text-cargo-text mt-1">
                {reportData?.summary?.total_trips || 0} / {(reportData?.summary?.total_distance || 0).toLocaleString()} km
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="card lg:col-span-2">
              <h2 className="text-lg font-semibold text-cargo-text mb-3">Current Assignment</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-lg border border-cargo-border p-3">
                  <p className="text-xs text-cargo-muted">Current Driver</p>
                  <p className="text-cargo-text mt-1 font-medium">{reportData?.car?.current_driver_name || 'No active driver'}</p>
                </div>
                <div className="rounded-lg border border-cargo-border p-3">
                  <p className="text-xs text-cargo-muted">Phone</p>
                  <p className="text-cargo-text mt-1 font-medium">{reportData?.car?.current_driver_phone || 'N/A'}</p>
                </div>
                <div className="rounded-lg border border-cargo-border p-3">
                  <p className="text-xs text-cargo-muted">Current Meter</p>
                  <p className="text-cargo-text mt-1 font-medium">{(reportData?.car?.current_meter_reading || 0).toLocaleString()} km</p>
                </div>
              </div>
            </div>

            <div className="card">
              <h2 className="text-lg font-semibold text-cargo-text mb-3">Trip Status</h2>
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg border border-cargo-border p-3">
                  <div className="flex items-center gap-2 text-cargo-accent">
                    <Clock3 className="w-4 h-4" />
                    <span className="text-sm">Ongoing</span>
                  </div>
                  <span className="text-cargo-text font-semibold">{ongoingTrips.length}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-cargo-border p-3">
                  <div className="flex items-center gap-2 text-cargo-success">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-sm">Completed</span>
                  </div>
                  <span className="text-cargo-text font-semibold">{completedTrips.length}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="text-lg font-semibold text-cargo-text mb-3">Driver Assignment History</h2>
            {reportData?.assignments?.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {reportData.assignments.map((assignment) => (
                  <div key={assignment.id} className="rounded-lg border border-cargo-border p-3 space-y-1">
                    <p className="text-cargo-text font-medium flex items-center gap-2"><User className="w-4 h-4 text-cargo-muted" />{assignment.driver_name}</p>
                    <p className="text-sm text-cargo-muted">Assigned: {formatDate(assignment.assigned_at)}</p>
                    <p className="text-sm text-cargo-muted">Unassigned: {assignment.unassigned_at ? formatDate(assignment.unassigned_at) : 'Currently assigned'}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-cargo-muted">No assignment history found.</p>
            )}
          </div>

          <div className="card space-y-4">
            <h2 className="text-lg font-semibold text-cargo-text">Ongoing Trips</h2>
            {ongoingTrips.length ? (
              ongoingTrips.map((trip) => <TripCard key={trip.id} trip={trip} status="ongoing" />)
            ) : (
              <p className="text-cargo-muted">No ongoing trips in this period.</p>
            )}
          </div>

          <div className="card space-y-4">
            <h2 className="text-lg font-semibold text-cargo-text">Completed Trip Records</h2>
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
