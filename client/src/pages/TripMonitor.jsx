import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { format } from 'date-fns';
import { Route, Clock, MapPin, DollarSign, Activity } from 'lucide-react';

const TripMonitor = () => {
  const { get, loading } = useApi();
  const [trips, setTrips] = useState([]);
  const [filter, setFilter] = useState('all'); // all, ongoing, completed

  useEffect(() => {
    fetchTrips();
  }, []);

  const fetchTrips = async () => {
    // Fetch all trips from admin endpoint
    const result = await get('/admin/dashboard');
    if (result.success) {
      setTrips(result.data.recentTrips || []);
    }
  };

  const filteredTrips = trips.filter(trip => {
    if (filter === 'all') return true;
    return trip.status === filter;
  });

  const statusColors = {
    ongoing: 'bg-cargo-accent/20 text-cargo-accent border-cargo-accent/30',
    completed: 'bg-cargo-success/20 text-cargo-success border-cargo-success/30',
    cancelled: 'bg-cargo-danger/20 text-cargo-danger border-cargo-danger/30'
  };

  return (
    <div className="space-y-6 pb-10 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-cargo-text">Trip Monitor</h1>
          <p className="text-cargo-muted mt-1">Monitor all trips in real-time</p>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'all' ? 'bg-primary-600 text-white' : 'bg-cargo-card text-cargo-muted hover:text-cargo-text'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('ongoing')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'ongoing' ? 'bg-cargo-accent text-cargo-dark' : 'bg-cargo-card text-cargo-muted hover:text-cargo-text'
            }`}
          >
            Ongoing
          </button>
          <button
            onClick={() => setFilter('completed')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'completed' ? 'bg-cargo-success text-white' : 'bg-cargo-card text-cargo-muted hover:text-cargo-text'
            }`}
          >
            Completed
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-600/20 rounded-lg flex items-center justify-center">
              <Route className="w-5 h-5 text-primary-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-cargo-text">
                {trips.filter(t => t.status === 'ongoing').length}
              </p>
              <p className="text-xs text-cargo-muted">Ongoing Trips</p>
            </div>
          </div>
        </div>
        
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-cargo-success/20 rounded-lg flex items-center justify-center">
              <Activity className="w-5 h-5 text-cargo-success" />
            </div>
            <div>
              <p className="text-2xl font-bold text-cargo-text">
                {trips.filter(t => t.status === 'completed').length}
              </p>
              <p className="text-xs text-cargo-muted">Completed Today</p>
            </div>
          </div>
        </div>
      </div>

      {/* Trips List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTrips.map(trip => (
            <div key={trip.id} className={`card border-l-4 ${statusColors[trip.status]}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[trip.status]}`}>
                      {trip.status.toUpperCase()}
                    </span>
                    <span className="text-sm text-cargo-muted">
                      {format(new Date(trip.started_at), 'MMM dd, yyyy HH:mm')}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-cargo-muted mb-1">Driver</p>
                      <p className="text-sm font-medium text-cargo-text">{trip.driver_name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-cargo-muted mb-1">Vehicle</p>
                      <p className="text-sm font-medium text-cargo-text">{trip.car_number}</p>
                    </div>
                    <div>
                      <p className="text-xs text-cargo-muted mb-1">Revenue</p>
                      <p className="text-sm font-medium text-cargo-text">{trip.freight_charge?.toLocaleString()}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 mt-4 text-sm text-cargo-muted">
                    <MapPin className="w-4 h-4" />
                    <span>{trip.from_location}</span>
                    <span>→</span>
                    <span>{trip.to_location}</span>
                  </div>
                </div>
                
                {trip.status === 'ongoing' && (
                  <div className="flex items-center gap-2 text-cargo-accent">
                    <Clock className="w-5 h-5 animate-pulse" />
                    <span className="text-sm font-medium">In Progress</span>
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {filteredTrips.length === 0 && (
            <div className="card text-center py-12">
              <Route className="w-12 h-12 text-cargo-muted mx-auto mb-4" />
              <p className="text-cargo-muted">No trips found</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TripMonitor;