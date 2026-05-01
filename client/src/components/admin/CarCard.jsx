import { Car, User, Gauge, TrendingUp, AlertCircle, FileText, MapPin } from 'lucide-react';
import { formatLocationAgo, formatLocationSummary } from '../../utils/location';

const formatAverage = (value) => {
  const numericValue = Number(value || 0);
  return numericValue > 0 ? `${numericValue.toFixed(2)} km/L` : 'N/A';
};

const CarCard = ({ car, onEdit, onDelete, onAssign, onViewHistory }) => {
  const statusColors = {
    active: 'bg-cargo-success/20 text-cargo-success',
    maintenance: 'bg-cargo-accent/20 text-cargo-accent',
    retired: 'bg-cargo-danger/20 text-cargo-danger'
  };

  const tripStatusLabel = car.trip_status === 'ongoing'
    ? `Ongoing: ${car.ongoing_from_location} -> ${car.ongoing_to_location}`
    : car.trip_status === 'completed'
      ? `Last completed: ${car.last_from_location} -> ${car.last_to_location}`
      : 'No trip history yet';
  const lastLocationAgo = formatLocationAgo(car.last_location_at);
  const hasLocation = car.last_location_latitude != null && car.last_location_longitude != null;

  return (
    <div className="card hover:border-primary-500/50 transition-all group">
      <div className="flex items-start justify-between mb-4 gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-primary-600/20 rounded-xl flex items-center justify-center">
            <Car className="w-6 h-6 text-primary-400" />
          </div>
          <div>
            <h3 className="font-semibold text-cargo-text">{car.car_number}</h3>
            <span className={`text-xs px-2 py-1 rounded-full ${statusColors[car.status]}`}>
              {car.status}
            </span>
          </div>
        </div>
        
        <div className="flex flex-wrap justify-end gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onViewHistory(car)}
            className="p-2 text-cargo-muted hover:text-primary-400 hover:bg-primary-600/10 rounded-lg transition-colors"
          >
            <FileText className="w-4 h-4" />
          </button>
          <button 
            onClick={() => onEdit(car)}
            className="p-2 text-cargo-muted hover:text-primary-400 hover:bg-primary-600/10 rounded-lg transition-colors"
          >
            Edit
          </button>
          <button 
            onClick={() => onDelete(car.id)}
            className="p-2 text-cargo-muted hover:text-cargo-danger hover:bg-cargo-danger/10 rounded-lg transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="flex items-center gap-2 text-sm">
          <Gauge className="w-4 h-4 text-cargo-muted" />
          <span className="text-cargo-text">{car.current_meter_reading?.toLocaleString()} km</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <TrendingUp className="w-4 h-4 text-cargo-muted" />
          <span className="text-cargo-text">{car.total_revenue?.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-2 text-sm col-span-2">
          <Gauge className="w-4 h-4 text-cargo-muted" />
          <span className="text-cargo-text">Average: {formatAverage(car.overall_average_km_per_liter)}</span>
        </div>
      </div>

      <div className="border-t border-cargo-border pt-4 space-y-3">
        {car.assigned_driver ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-cargo-success" />
              <span className="text-sm text-cargo-text">{car.assigned_driver}</span>
            </div>
            <button 
              onClick={() => onAssign(car)}
              className="text-xs text-primary-400 hover:text-primary-300"
            >
              Reassign
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-cargo-accent" />
              <span className="text-sm text-cargo-muted">Not assigned</span>
            </div>
            <button 
              onClick={() => onAssign(car)}
              className="text-xs text-primary-400 hover:text-primary-300"
            >
              Assign Driver
            </button>
          </div>
        )}

        <div className="rounded-lg bg-cargo-dark/70 border border-cargo-border px-3 py-2">
          <p className={`text-xs font-medium ${car.trip_status === 'ongoing' ? 'text-cargo-success' : 'text-cargo-muted'}`}>
            {tripStatusLabel}
          </p>
        </div>

        <div className="rounded-lg bg-cargo-dark/70 border border-cargo-border px-3 py-3">
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-primary-400 mt-0.5" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs font-semibold text-cargo-text">Driver location</p>
                {lastLocationAgo ? (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary-600/10 text-primary-300">
                    {lastLocationAgo}
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-cargo-text mt-1">{formatLocationSummary(car)}</p>
              {hasLocation ? (
                <p className="text-[11px] text-cargo-muted mt-1">
                  {car.last_location_latitude}, {car.last_location_longitude}
                </p>
              ) : (
                <p className="text-[11px] text-cargo-muted mt-1">No location saved yet</p>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={() => onViewHistory(car)}
          className="w-full btn-secondary text-sm py-2"
        >
          View Details
        </button>
      </div>
    </div>
  );
};

export default CarCard;
