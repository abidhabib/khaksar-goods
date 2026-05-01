import { useEffect, useState } from 'react';
import { CheckCircle2, Clock3, MapPin, XCircle } from 'lucide-react';
import { useApi } from '../hooks/useApi';

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const LeaveRequestsPage = () => {
  const { get, put, loading } = useApi();
  const [drivers, setDrivers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [filters, setFilters] = useState({ status: 'pending_join', driver_id: '' });
  const [submittingId, setSubmittingId] = useState(null);

  const fetchDrivers = async () => {
    const result = await get('/admin/drivers');
    if (result.success) {
      setDrivers(result.data.drivers || []);
    }
  };

  const fetchRequests = async (activeFilters = filters) => {
    const params = {};
    if (activeFilters.status) params.status = activeFilters.status;
    if (activeFilters.driver_id) params.driver_id = activeFilters.driver_id;

    const result = await get('/admin/leave-requests', { params });
    if (result.success) {
      setRequests(result.data.requests || []);
    }
  };

  useEffect(() => {
    fetchDrivers();
    fetchRequests(filters);
  }, []);

  const updateStatus = async (id, action) => {
    setSubmittingId(id);
    const result = await put(`/admin/leave-requests/${id}/status`, { action });
    setSubmittingId(null);
    if (result.success) {
      fetchRequests(filters);
    } else {
      alert(result.error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-cargo-border bg-gradient-to-r from-cargo-card to-cargo-dark p-5">
        <h1 className="text-2xl font-bold text-cargo-text flex items-center gap-2">
          <Clock3 className="w-6 h-6 text-primary-400" />
          Leave Requests
        </h1>
        <p className="text-cargo-muted mt-1">Approve drivers returning from leave and compare leave/join meter readings.</p>
      </div>

      <div className="card grid grid-cols-1 md:grid-cols-3 gap-3">
        <select
          value={filters.status}
          onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
          className="input-field"
        >
          <option value="pending_join">Pending Join</option>
          <option value="on_leave">On Leave</option>
          <option value="completed">Completed</option>
          <option value="rejected_join">Rejected Join</option>
        </select>
        <select
          value={filters.driver_id}
          onChange={(e) => setFilters((prev) => ({ ...prev, driver_id: e.target.value }))}
          className="input-field"
        >
          <option value="">All Drivers</option>
          {drivers.map((driver) => (
            <option key={driver.id} value={driver.id}>{driver.username}</option>
          ))}
        </select>
        <button type="button" onClick={() => fetchRequests(filters)} className="btn-primary">
          Apply Filter
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[1100px]">
          <thead>
            <tr className="border-b border-cargo-border text-left">
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Driver</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Car</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Status</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Leave Meter</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Join Meter</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Leave Location</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Join Location</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Leave Time</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Join Time</th>
              <th className="py-3 pr-4 text-xs uppercase tracking-wide text-cargo-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            {requests.length ? requests.map((request) => (
              <tr key={request.id} className="border-b border-cargo-border/60">
                <td className="py-3 pr-4 text-sm text-cargo-text">{request.driver_name}</td>
                <td className="py-3 pr-4 text-sm text-cargo-text">{request.car_number || 'N/A'}</td>
                <td className="py-3 pr-4 text-sm text-cargo-text capitalize">{request.status}</td>
                <td className="py-3 pr-4 text-sm text-cargo-text">{Number(request.leave_meter_reading || 0).toLocaleString()}</td>
                <td className="py-3 pr-4 text-sm text-cargo-text">{request.join_meter_reading != null ? Number(request.join_meter_reading).toLocaleString() : '-'}</td>
                <td className="py-3 pr-4 text-sm text-cargo-muted"><span className="inline-flex items-center gap-1"><MapPin className="w-4 h-4" />{request.leave_location || '-'}</span></td>
                <td className="py-3 pr-4 text-sm text-cargo-muted"><span className="inline-flex items-center gap-1"><MapPin className="w-4 h-4" />{request.join_location || '-'}</span></td>
                <td className="py-3 pr-4 text-sm text-cargo-muted">{formatDateTime(request.leave_requested_at)}</td>
                <td className="py-3 pr-4 text-sm text-cargo-muted">{formatDateTime(request.join_requested_at)}</td>
                <td className="py-3 pr-4 text-sm">
                  {request.status === 'pending_join' ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={submittingId === request.id}
                        onClick={() => updateStatus(request.id, 'approve')}
                        className="inline-flex items-center gap-1 rounded-lg bg-cargo-success/15 px-3 py-2 text-cargo-success"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={submittingId === request.id}
                        onClick={() => updateStatus(request.id, 'reject')}
                        className="inline-flex items-center gap-1 rounded-lg bg-cargo-danger/15 px-3 py-2 text-cargo-danger"
                      >
                        <XCircle className="w-4 h-4" />
                        Reject
                      </button>
                    </div>
                  ) : (
                    <span className="text-cargo-muted">{loading ? 'Loading...' : 'No action'}</span>
                  )}
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan="10" className="py-6 text-center text-cargo-muted">No leave requests found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default LeaveRequestsPage;
