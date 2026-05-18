import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import StatCard from '../components/admin/StatCard';
import TripTable from '../components/admin/TripTable';
import ExpenseBreakdown from '../components/admin/ExpenseBreakdown';
import { 
  Car, 
  Users, 
  HandHelping,
  DollarSign,
  Activity
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const AdminDashboard = () => {
  const { get, loading } = useApi();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [recentTrips, setRecentTrips] = useState([]);
  const [revenueData, setRevenueData] = useState([]);
  const [expenseBreakdown, setExpenseBreakdown] = useState([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      const result = await get('/admin/dashboard');
      if (result.success) {
        setStats(result.data.stats);
        setRecentTrips(result.data.recentTrips);
        setRevenueData(result.data.revenueChart || []);
        setExpenseBreakdown(result.data.expenseBreakdown || []);
      }
    };

    fetchDashboardData();
  }, [get]);

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
          subtitle="Current month"
          icon={DollarSign}
          color="blue"
        />
        <StatCard
          title="Monthly Expenses"
          value={stats.monthly_expenses?.toLocaleString() || 0}
          subtitle="Trip + daily + bilty"
          icon={DollarSign}
          color="red"
        />
        <StatCard
          title="Monthly Net Income"
          value={stats.monthly_net_income?.toLocaleString() || 0}
          subtitle="After approved cashout"
          icon={DollarSign}
          color="green"
        />
      </div>

      {/* Charts Row */}
         
          
     
        <ExpenseBreakdown data={expenseBreakdown} />

      {/* Recent Trips Table */}
      <TripTable 
        trips={recentTrips} 
        onViewTrip={(trip) => navigate(`/trips/${trip.id}/report`)}
      />
    </div>
  );
};

export default AdminDashboard;
