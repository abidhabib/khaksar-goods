import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import StatCard from '../components/admin/StatCard';
import TripTable from '../components/admin/TripTable';
import ExpenseBreakdown from '../components/admin/ExpenseBreakdown';
import { 
  Car, 
  Users, 
  Route, 
  DollarSign,
  Activity
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const AdminDashboard = () => {
  const { get, loading } = useApi();
  const [stats, setStats] = useState(null);
  const [recentTrips, setRecentTrips] = useState([]);
  const [revenueData, setRevenueData] = useState([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      const result = await get('/admin/dashboard');
      if (result.success) {
        setStats(result.data.stats);
        setRecentTrips(result.data.recentTrips);
        setRevenueData(result.data.revenueChart || []);
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-cargo-text">Dashboard</h1>
        <div className="flex items-center gap-2 text-sm text-cargo-muted">
          <Activity className="w-4 h-4" />
          <span>Last updated: {new Date().toLocaleTimeString()}</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Active Cars"
          value={stats.active_cars}
          subtitle="Total fleet vehicles"
          icon={Car}
          color="blue"
        />
        <StatCard
          title="Active Drivers"
          value={stats.active_drivers}
          subtitle="Currently working"
          icon={Users}
          color="green"
        />
        <StatCard
          title="Ongoing Trips"
          value={stats.ongoing_trips}
          subtitle="In progress now"
          icon={Route}
          color="amber"
        />
        <StatCard
          title="Today's Revenue"
          value={`${stats.today_revenue?.toLocaleString()}`}
          subtitle={`Net: ${stats.net_today?.toLocaleString()}`}
          trend="+12%"
          trendUp={true}
          icon={DollarSign}
          color="purple"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-cargo-text">Revenue vs Expenses</h3>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-primary-500 rounded-full" />
                <span className="text-cargo-muted">Revenue</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-cargo-danger rounded-full" />
                <span className="text-cargo-muted">Expenses</span>
              </div>
            </div>
          </div>
          
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1e293b', 
                    border: '1px solid #334155',
                    borderRadius: '8px'
                  }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="#3b82f6" 
                  fillOpacity={1} 
                  fill="url(#colorRevenue)" 
                />
                <Area 
                  type="monotone" 
                  dataKey="expenses" 
                  stroke="#ef4444" 
                  fillOpacity={1} 
                  fill="url(#colorExpenses)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <ExpenseBreakdown />
      </div>

      {/* Recent Trips Table */}
      <TripTable 
        trips={recentTrips} 
        onViewTrip={(trip) => console.log('View trip:', trip)}
      />
    </div>
  );
};

export default AdminDashboard;
