import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  Download,
  CalendarDays,
  SlidersHorizontal,
  FileText,
  ArrowRight,
  DollarSign,
  Receipt,
  Truck,
  Wallet,
  Package,
} from 'lucide-react';
import { useApi } from '../hooks/useApi';

const formatCurrency = (value) => `Rs ${Number(value || 0).toLocaleString()}`;

const getChangeConfig = (value, inverse = false) => {
  if (value === 0) {
    return { icon: Minus, color: 'text-slate-500', bg: 'bg-slate-800', label: 'No change' };
  }
  const isPositive = inverse ? value <= 0 : value >= 0;
  if (isPositive) {
    return { icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: `+${value}%` };
  }
  return { icon: TrendingDown, color: 'text-rose-400', bg: 'bg-rose-500/10', label: `${value}%` };
};

const reportTypeConfig = {
  revenue: {
    title: 'Revenue Trend',
    dataKey: 'revenue',
    color: '#38bdf8',
    formatter: formatCurrency,
  },
  expenses: {
    title: 'Expense Trend',
    dataKey: 'expenses',
    color: '#fb7185',
    formatter: formatCurrency,
  },
  trips: {
    title: 'Trip Volume',
    dataKey: 'trips',
    color: '#a78bfa',
    formatter: (value) => `${value} trips`,
  },
};

const Reports = () => {
  const { get, loading } = useApi();
  const [period, setPeriod] = useState('week');
  const [reportType, setReportType] = useState('revenue');
  const [reportData, setReportData] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const fetchReports = async () => {
      const result = await get('/admin/reports', {
        params: { period },
      });

      if (result.success) {
        setReportData(result.data);
      }
    };

    fetchReports();
  }, [get, period]);

  const handleExportPdf = () => {
    if (!reportData) return;

    setExporting(true);

    try {
      const doc = new jsPDF();
      const currentDate = format(new Date(), 'PPP p');

      doc.setFontSize(18);
      doc.text('Cargo Tracker Report', 14, 18);
      doc.setFontSize(11);
      doc.text(`Period: ${period}`, 14, 26);
      doc.text(`Generated: ${currentDate}`, 14, 32);

      autoTable(doc, {
        startY: 40,
        head: [['Metric', 'Value', 'Change']],
        body: [
          ['Total Revenue', formatCurrency(reportData.summary.totalRevenue), `${reportData.comparison.revenueChange}%`],
          ['Total Expenses', formatCurrency(reportData.summary.totalExpenses), `${reportData.comparison.expensesChange}%`],
          ['Net Profit', formatCurrency(reportData.summary.netProfit), `${reportData.comparison.netProfitChange}%`],
          ['Total Trips', String(reportData.summary.totalTrips), `${reportData.comparison.tripsChange}%`],
        ],
      });

      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 10,
        head: [['Label', 'Revenue', 'Expenses', 'Trips']],
        body: reportData.trend.map((item) => [
          item.label,
          formatCurrency(item.revenue),
          formatCurrency(item.expenses),
          String(item.trips),
        ]),
      });

      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 10,
        head: [['Category', 'Amount', 'Share']],
        body: reportData.expenseBreakdown.map((item) => [
          item.category,
          formatCurrency(item.amount),
          `${item.percentage}%`,
        ]),
      });

      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 10,
        head: [['Date', 'Route', 'Driver', 'Car', 'Revenue', 'Expenses', 'Net']],
        body: reportData.recentTrips.map((trip) => [
          format(new Date(trip.started_at), 'PP'),
          `${trip.source} -> ${trip.destination}`,
          trip.driver_name,
          trip.car_number,
          formatCurrency(trip.freight_charge),
          formatCurrency(trip.total_expenses),
          formatCurrency(trip.net_profit),
        ]),
      });

      doc.save(`cargo-report-${period}-${format(new Date(), 'yyyy-MM-dd-HH-mm')}.pdf`);
    } catch (error) {
      console.error('PDF export error:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const chartConfig = reportTypeConfig[reportType];

  if (loading || !reportData) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const summaryCards = [
    {
      label: 'Total Revenue',
      value: formatCurrency(reportData.summary.totalRevenue),
      change: getChangeConfig(reportData.comparison.revenueChange),
      icon: DollarSign,
    },
    {
      label: 'Total Expenses',
      value: formatCurrency(reportData.summary.totalExpenses),
      change: getChangeConfig(reportData.comparison.expensesChange, true),
      icon: Receipt,
    },
    {
      label: 'Net Profit',
      value: formatCurrency(reportData.summary.netProfit),
      change: getChangeConfig(reportData.comparison.netProfitChange),
      icon: Wallet,
    },
    {
      label: 'Total Trips',
      value: reportData.summary.totalTrips,
      change: getChangeConfig(reportData.comparison.tripsChange),
      icon: Truck,
    },
  ];

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 border border-slate-700">
            <BarChart3 className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Reports & Analytics</h1>
            <p className="text-sm text-slate-500">Financial overview from trip data</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleExportPdf}
          disabled={exporting}
          className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-50 transition-colors"
        >
          <Download className="w-4 h-4" />
          {exporting ? 'Exporting...' : 'Export PDF'}
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-lg bg-slate-900 border border-slate-800 p-1">
          {[
            { value: 'week', label: '7 Days' },
            { value: 'month', label: '30 Days' },
            { value: 'year', label: '12 Months' },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPeriod(opt.value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                period === opt.value
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 rounded-lg bg-slate-900 border border-slate-800 px-2 py-1">
          <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500 ml-1" />
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            className="bg-transparent text-sm text-slate-300 outline-none py-1 pr-1"
          >
            <option value="revenue">Revenue</option>
            <option value="expenses">Expenses</option>
            <option value="trips">Trips</option>
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {summaryCards.map((card) => {
          const ChangeIcon = card.change.icon;
          return (
            <div key={card.label} className="rounded-lg border border-slate-800 bg-slate-900/80 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-slate-500">
                  <card.icon className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">{card.label}</span>
                </div>
              </div>
              <p className="text-lg font-bold text-slate-100">{card.value}</p>
              <div className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 mt-1.5 text-xs font-medium ${card.change.bg} ${card.change.color}`}>
                <ChangeIcon className="w-3 h-3" />
                {card.change.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Trend Chart */}
        <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-4">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-semibold text-slate-200">{chartConfig.title}</h3>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={reportData.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="label" stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#475569" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                <Tooltip
                  formatter={(value) => chartConfig.formatter(value)}
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#e2e8f0',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey={chartConfig.dataKey}
                  stroke={chartConfig.color}
                  strokeWidth={2}
                  dot={{ fill: chartConfig.color, r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Expense Breakdown */}
        <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-4">
          <div className="flex items-center gap-2 mb-4">
            <Receipt className="w-4 h-4 text-rose-400" />
            <h3 className="text-sm font-semibold text-slate-200">Expense Breakdown</h3>
          </div>
          {reportData.expenseBreakdown.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-56 text-slate-600">
              <Receipt className="w-8 h-8 mb-2" />
              <p className="text-sm">No expense data</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reportData.expenseBreakdown.map((item) => (
                <div key={item.category}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-slate-300 capitalize">{item.category}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-200">{formatCurrency(item.amount)}</span>
                      <span className="text-xs text-slate-500">{item.percentage}%</span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5">
                    <div
                      className="bg-sky-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Revenue vs Expenses */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-4">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-4 h-4 text-sky-400" />
          <h3 className="text-sm font-semibold text-slate-200">Revenue vs Expenses</h3>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={reportData.trend} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="label" stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#475569" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
              <Tooltip
                formatter={(value) => formatCurrency(value)}
                contentStyle={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: '#e2e8f0',
                }}
              />
              <Bar dataKey="revenue" fill="#38bdf8" radius={[4, 4, 0, 0]} maxBarSize={40} />
              <Bar dataKey="expenses" fill="#fb7185" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Trips */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-4">
        <div className="flex items-center gap-2 mb-4">
          <Truck className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-200">Recent Completed Trips</h3>
        </div>
        {reportData.recentTrips.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-slate-600">
            <Package className="w-8 h-8 mb-2" />
            <p className="text-sm">No completed trips</p>
          </div>
        ) : (
          <div className="space-y-2">
            {reportData.recentTrips.map((trip) => (
              <div
                key={trip.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-md bg-slate-950/40 border border-slate-800/50 p-3 hover:border-slate-700 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm text-slate-200">
                    <span className="truncate">{trip.source}</span>
                    <ArrowRight className="w-3 h-3 text-slate-600 shrink-0" />
                    <span className="truncate">{trip.destination}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {trip.driver_name} &bull; {trip.car_number} &bull; {format(new Date(trip.started_at), 'MMM d, yyyy')}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs shrink-0">
                  <div className="text-right">
                    <p className="text-slate-500">Revenue</p>
                    <p className="font-medium text-slate-200">{formatCurrency(trip.freight_charge)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-slate-500">Expenses</p>
                    <p className="font-medium text-slate-200">{formatCurrency(trip.total_expenses)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-slate-500">Net</p>
                    <p className="font-medium text-emerald-400">{formatCurrency(trip.net_profit)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Reports;