import { useState } from 'react';
import { User, Phone, Car, Activity, MoreVertical, MapPin, HandHelping, Wallet, Coins, CalendarDays, IdCard } from 'lucide-react';
import { formatLocationAgo, formatLocationSummary } from '../../utils/location';

const DriverCard = ({ driver, onEdit, onAssign, onViewReport }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const statusColors = {
    active: 'bg-cargo-success/20 text-cargo-success',
    inactive: 'bg-cargo-muted/20 text-cargo-muted',
    suspended: 'bg-cargo-danger/20 text-cargo-danger'
  };

  const tripStatusLabel = driver.trip_status === 'ongoing'
    ? `Ongoing: ${driver.ongoing_from_location} -> ${driver.ongoing_to_location}`
    : driver.trip_status === 'completed'
      ? `Last completed: ${driver.last_from_location} -> ${driver.last_to_location}`
      : 'No trip history yet';
  const lastLocationAgo = formatLocationAgo(driver.last_location_at);
  const hasLocation = driver.last_location_latitude != null && driver.last_location_longitude != null;
  const formatCurrency = (value) => `Rs ${Number(value || 0).toLocaleString()}`;

  return (
    <div className="card hover:border-primary-500/50 transition-all group">
      <div className="flex items-start justify-between mb-4 gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-cargo-border rounded-full flex items-center justify-center">
            <User className="w-6 h-6 text-cargo-muted" />
          </div>
          <div>
            <h3 className="font-semibold text-cargo-text">{driver.full_name || driver.username}</h3>
            <p className="text-xs text-cargo-muted mt-1">@{driver.username}</p>
            <span className={`text-xs px-2 py-1 rounded-full ${statusColors[driver.status]}`}>
              {driver.status}
            </span>
          </div>
        </div>
        
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="p-2 text-cargo-muted hover:text-cargo-text rounded-lg hover:bg-cargo-border transition-colors"
          >
            <MoreVertical className="w-5 h-5" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-12 z-10 min-w-40 rounded-lg border border-cargo-border bg-cargo-card shadow-xl">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onEdit(driver);
                }}
                className="block w-full px-4 py-2 text-left text-sm text-cargo-text hover:bg-cargo-border/40"
              >
                Edit Driver
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onAssign(driver);
                }}
                className="block w-full px-4 py-2 text-left text-sm text-cargo-text hover:bg-cargo-border/40"
              >
                {driver.car_id ? 'Reassign Car' : 'Assign Car'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onViewReport(driver.id);
                }}
                className="block w-full px-4 py-2 text-left text-sm text-cargo-text hover:bg-cargo-border/40"
              >
                View Report
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/30 p-3">
          <p className="text-[11px] uppercase tracking-wide text-cargo-muted flex items-center gap-1">
            <Phone className="w-3.5 h-3.5" />
            Phone
          </p>
          <p className="text-sm text-cargo-text font-semibold mt-1.5">{driver.phone || 'N/A'}</p>
        </div>
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/30 p-3">
          <p className="text-[11px] uppercase tracking-wide text-cargo-muted flex items-center gap-1">
            <Car className="w-3.5 h-3.5" />
            Car
          </p>
          <p className="text-sm text-cargo-text font-semibold mt-1.5">{driver.car_number || 'No cargo assigned'}</p>
        </div>
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/30 p-3">
          <p className="text-[11px] uppercase tracking-wide text-cargo-muted flex items-center gap-1">
            <IdCard className="w-3.5 h-3.5" />
            License
          </p>
          <p className="text-sm text-cargo-text font-semibold mt-1.5">{driver.license_number || 'N/A'}</p>
        </div>
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/30 p-3">
          <p className="text-[11px] uppercase tracking-wide text-cargo-muted flex items-center gap-1">
            <HandHelping className="w-3.5 h-3.5" />
            Helper
          </p>
          <p className="text-sm text-cargo-text font-semibold mt-1.5">
            {driver.helper_name ? `${driver.helper_name}${driver.helper_phone_number ? ` • ${driver.helper_phone_number}` : ''}` : 'No helper assigned'}
          </p>
        </div>
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/30 p-3">
          <p className="text-[11px] uppercase tracking-wide text-cargo-muted flex items-center gap-1">
            <Wallet className="w-3.5 h-3.5" />
            Available Balance
          </p>
          <p className="text-sm text-primary-300 font-semibold mt-1.5">{formatCurrency(driver.available_balance)}</p>
        </div>
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/30 p-3">
          <p className="text-[11px] uppercase tracking-wide text-cargo-muted flex items-center gap-1">
            <Coins className="w-3.5 h-3.5" />
            Commission Balance
          </p>
          <p className="text-sm text-primary-300 font-semibold mt-1.5">{formatCurrency(driver.commission_balance)}</p>
        </div>
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/30 p-3">
          <p className="text-[11px] uppercase tracking-wide text-cargo-muted flex items-center gap-1">
            <Activity className="w-3.5 h-3.5" />
            Salary / Commission
          </p>
          <p className="text-sm text-cargo-text font-semibold mt-1.5">
            {formatCurrency(driver.salary_amount)} / {Number(driver.commission_percentage || 0)}%
          </p>
        </div>
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/30 p-3">
          <p className="text-[11px] uppercase tracking-wide text-cargo-muted flex items-center gap-1">
            <CalendarDays className="w-3.5 h-3.5" />
            Joined Date
          </p>
          <p className="text-sm text-cargo-text font-semibold mt-1.5">{driver.joined_date ? String(driver.joined_date).slice(0, 10) : 'N/A'}</p>
        </div>
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/30 p-3">
          <p className="text-[11px] uppercase tracking-wide text-cargo-muted">Driver / User ID</p>
          <p className="text-sm text-cargo-text font-semibold mt-1.5">{driver.id} / {driver.user_id}</p>
        </div>
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/30 p-3">
          <p className="text-[11px] uppercase tracking-wide text-cargo-muted">Assigned IDs</p>
          <p className="text-sm text-cargo-text font-semibold mt-1.5">
            Car: {driver.assigned_car_id || '-'} • Helper: {driver.helper_id || '-'}
          </p>
        </div>
        <div className="rounded-lg border border-cargo-border bg-cargo-dark/30 p-3">
          <p className="text-[11px] uppercase tracking-wide text-cargo-muted">Next Salary Credit</p>
          <p className="text-sm text-cargo-text font-semibold mt-1.5">
            {driver.next_salary_credit_date ? String(driver.next_salary_credit_date).slice(0, 10) : 'N/A'}
          </p>
        </div>

        <div className="rounded-lg bg-cargo-dark/70 border border-cargo-border px-3 py-2 md:col-span-2">
          <p className={`text-xs font-medium ${driver.trip_status === 'ongoing' ? 'text-amber-500' : 'text-cargo-muted'}`}>
            {tripStatusLabel}
          </p>
        </div>

        <div className="rounded-lg bg-cargo-dark/70 border border-cargo-border px-3 py-3 md:col-span-2">
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-primary-400 mt-0.5" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs font-semibold text-cargo-text">Last location</p>
                {lastLocationAgo ? (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary-600/10 text-primary-300">
                    {lastLocationAgo}
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-cargo-text mt-1">{formatLocationSummary(driver)}</p>
              {hasLocation ? (
                <p className="text-[11px] text-cargo-muted mt-1">
                  {driver.last_location_latitude}, {driver.last_location_longitude}
                </p>
              ) : (
                <p className="text-[11px] text-cargo-muted mt-1">No location saved yet</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2 pt-4 border-t border-cargo-border">
        <button 
          onClick={() => onViewReport(driver.id)}
          className="flex-1 btn-secondary text-sm py-2"
        >
          View Report
        </button>
        <button 
          onClick={() => onAssign(driver)}
          className="flex-1 btn-primary text-sm py-2"
        >
          {driver.car_id ? 'Reassign Car' : 'Assign Car'}
        </button>
      </div>
    </div>
  );
};

export default DriverCard;
