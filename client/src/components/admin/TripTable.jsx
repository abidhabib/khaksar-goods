import { useState } from 'react';
import { ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { format } from 'date-fns';

const TripTable = ({ trips, onViewTrip }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const totalPages = Math.ceil((trips?.length || 0) / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedTrips = trips?.slice(startIndex, startIndex + itemsPerPage);

  const statusColors = {
    ongoing: 'bg-cargo-accent/20 text-cargo-accent',
    completed: 'bg-cargo-success/20 text-cargo-success',
    cancelled: 'bg-cargo-danger/20 text-cargo-danger'
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-cargo-text">Recent Trips</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-cargo-border">
              <th className="text-left py-3 px-4 text-sm font-medium text-cargo-muted">Driver</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-cargo-muted">Car</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-cargo-muted">Route</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-cargo-muted">Status</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-cargo-muted">Revenue</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-cargo-muted">Date</th>
              <th className="text-center py-3 px-4 text-sm font-medium text-cargo-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedTrips?.map((trip) => (
              <tr key={trip.id} className="border-b border-cargo-border/50 hover:bg-cargo-border/20">
                <td className="py-3 px-4 text-sm text-cargo-text">{trip.driver_name}</td>
                <td className="py-3 px-4 text-sm text-cargo-text">{trip.car_number}</td>
                <td className="py-3 px-4 text-sm text-cargo-text">
                  {trip.from_location} → {trip.to_location}
                </td>
                <td className="py-3 px-4">
                  <span className={`text-xs px-2 py-1 rounded-full ${statusColors[trip.status]}`}>
                    {trip.status}
                  </span>
                </td>
                <td className="py-3 px-4 text-sm text-cargo-text">
                  {trip.freight_charge?.toLocaleString()}
                </td>
                <td className="py-3 px-4 text-sm text-cargo-muted">
                  {format(new Date(trip.started_at), 'MMM dd, yyyy')}
                </td>
                <td className="py-3 px-4 text-center">
                  <button 
                    onClick={() => onViewTrip(trip)}
                    className="p-2 text-cargo-muted hover:text-primary-400 hover:bg-primary-600/10 rounded-lg transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-cargo-border">
          <p className="text-sm text-cargo-muted">
            Showing {startIndex + 1} to {Math.min(startIndex + itemsPerPage, trips.length)} of {trips.length} trips
          </p>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-cargo-border text-cargo-muted hover:text-cargo-text hover:bg-cargo-border disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            
            <span className="text-sm text-cargo-text px-4">
              Page {currentPage} of {totalPages}
            </span>
            
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg border border-cargo-border text-cargo-muted hover:text-cargo-text hover:bg-cargo-border disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TripTable;