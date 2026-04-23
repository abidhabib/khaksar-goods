import { useState } from 'react';
import { User, Phone, Car, Activity, MoreVertical } from 'lucide-react';

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

  return (
    <div className="card hover:border-primary-500/50 transition-all group">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-cargo-border rounded-full flex items-center justify-center">
            <User className="w-6 h-6 text-cargo-muted" />
          </div>
          <div>
            <h3 className="font-semibold text-cargo-text">{driver.username}</h3>
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

      <div className="space-y-3 mb-4">
        <div className="flex items-center gap-2 text-sm">
          <Phone className="w-4 h-4 text-cargo-muted" />
          <span className="text-cargo-text">{driver.phone || 'N/A'}</span>
        </div>
        
        <div className="flex items-center gap-2 text-sm">
          <Car className="w-4 h-4 text-cargo-muted" />
          {driver.car_number ? (
            <span className="text-cargo-text">{driver.car_number}</span>
          ) : (
            <span className="text-cargo-muted">No cargo assigned</span>
          )}
        </div>
        
        <div className="flex items-center gap-2 text-sm">
          <Activity className="w-4 h-4 text-cargo-muted" />
          <span className="text-cargo-text">
            {driver.license_number || 'License: N/A'}
          </span>
        </div>

        <div className="rounded-lg bg-cargo-dark/70 border border-cargo-border px-3 py-2">
          <p className={`text-xs font-medium ${driver.trip_status === 'ongoing' ? 'text-cargo-success' : 'text-cargo-muted'}`}>
            {tripStatusLabel}
          </p>
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
