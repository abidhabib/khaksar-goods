import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import StatCard from '../components/admin/StatCard';
import TripTable from '../components/admin/TripTable';
import { 
  Car, 
  Users, 
  HandHelping,
  DollarSign,
  Activity,
  CarIcon
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const AdminDashboard = () => {
  const { get, loading } = useApi();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [recentTrips, setRecentTrips] = useState([]);


  useEffect(() => {
    const fetchDashboardData = async () => {
      const result = await get('/admin/dashboard');
      if (result.success) {
        setStats(result.data.stats);
        setRecentTrips(result.data.recentTrips);
   
      }
    };

    fetchDashboardData();
  }, [get]);
console.log(stats);

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 ">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-cargo-text">Dashboard</h1>
        <div className="flex items-center gap-2 text-sm text-cargo-muted">
          <Activity className="w-4 h-4" />
          <span>Last updated: {new Date().toLocaleTimeString()}</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-3 max-w-3xl">
        <StatCard
          title="Active Cargo"
          value={stats.active_cars}
          subtitle="Total fleet"
          icon={Car}
          color="blue"
        />
        <StatCard
          title="Active Drivers"
          value={stats.active_drivers || 0}
          subtitle="Working now"
          icon={Users}
          color="green"
        />
        <StatCard
          title="Active Helpers"
          value={stats.active_helpers || 0}
          subtitle="Assigned staff"
          icon={HandHelping}
          color="amber"
        />
        <StatCard
          title="Monthly Freight"
          value={stats.monthly_freight?.toLocaleString() || 0}
          icon={DollarSign}
          color="blue"
        />
        <StatCard
          title="Expenses"
          value={stats.monthly_expenses?.toLocaleString() || 0}
          icon={DollarSign}
          color="red"
        />
        <StatCard
          title="Net Income"
          value={stats.monthly_net_income?.toLocaleString() || 0}
          icon={DollarSign}
          color="green"
        />
        <StatCard
          title="Company Amount"
          value={`Rs ${Number(stats.total_company_amount || 0).toLocaleString()}`}
          icon={DollarSign}
          color="purple"
        />
           <StatCard
          title="Going Trip"
          value={stats.ongoing_trips?.toLocaleString() || 0}
          icon={CarIcon}
          color="amber"
        />
           <StatCard
          title="Completed Trips"
          value={stats.completed_trips_this_month?.toLocaleString() || 0}
          icon={CarIcon}
          color="green"
        />
      </div>

         
          
     

      {/* Recent Trips Table */}
      <TripTable 
        trips={recentTrips} 
        onViewTrip={(trip) => navigate(`/trips/${trip.id}/report`)}
      />
    </div>
  );
};

export default AdminDashboard;
