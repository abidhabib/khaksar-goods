import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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
import { Calendar, Download, Filter, FileText } from 'lucide-react';
import { useApi } from '../hooks/useApi';

const formatCurrency = (value) => `Rs ${Number(value || 0).toLocaleString()}`;

const getChangeTone = (value, inverse = false) => {
  if (value === 0) {
    return 'text-cargo-muted';
  }

  const isPositive = inverse ? value <= 0 : value >= 0;
  return isPositive ? 'text-cargo-success' : 'text-cargo-danger';
};

const getChangeLabel = (value) => {
  if (value === 0) {
    return 'No change vs previous period';
  }

  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value}% vs previous period`;
};

const reportTypeConfig = {
  revenue: {
    title: 'Revenue Trend',
    dataKey: 'revenue',
    color: '#3b82f6',
    formatter: formatCurrency,
  },
  expenses: {
    title: 'Expense Trend',
    dataKey: 'expenses',
    color: '#ef4444',
    formatter: formatCurrency,
  },
  trips: {
    title: 'Trip Volume',
    dataKey: 'trips',
    color: '#f59e0b',
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
    if (!reportData) {
      return;
    }

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
          ['Total Revenue', formatCurrency(reportData.summary.totalRevenue), getChangeLabel(reportData.comparison.revenueChange)],
          ['Total Expenses', formatCurrency(reportData.summary.totalExpenses), getChangeLabel(reportData.comparison.expensesChange)],
          ['Net Profit', formatCurrency(reportData.summary.netProfit), getChangeLabel(reportData.comparison.netProfitChange)],
          ['Total Trips', String(reportData.summary.totalTrips), getChangeLabel(reportData.comparison.tripsChange)],
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
    } finally {
      setExporting(false);
    }
  };

  const chartConfig = reportTypeConfig[reportType];

  if (loading || !reportData) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10 max-w-7xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-cargo-text">Reports & Analytics</h1>
          <p className="text-cargo-muted mt-1">Live financial reports powered by your trip database</p>
        </div>
        <button
          type="button"
          onClick={handleExportPdf}
          disabled={exporting}
          className="btn-secondary flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          {exporting ? 'Exporting...' : 'Download PDF'}
        </button>
      </div>

      <div className="card flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-cargo-muted" />
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="bg-cargo-dark border border-cargo-border rounded-lg px-3 py-2 text-cargo-text"
          >
            <option value="week">Last 7 Days</option>
            <option value="month">Last 30 Days</option>
            <option value="year">Last 12 Months</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-cargo-muted" />
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            className="bg-cargo-dark border border-cargo-border rounded-lg px-3 py-2 text-cargo-text"
          >
            <option value="revenue">Revenue</option>
            <option value="expenses">Expenses</option>
            <option value="trips">Trips</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-sm text-cargo-muted mb-1">Total Revenue</p>
          <p className="text-2xl font-bold text-cargo-text">{formatCurrency(reportData.summary.totalRevenue)}</p>
          <p className={`text-xs mt-1 ${getChangeTone(reportData.comparison.revenueChange)}`}>
            {getChangeLabel(reportData.comparison.revenueChange)}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-cargo-muted mb-1">Total Expenses</p>
          <p className="text-2xl font-bold text-cargo-text">{formatCurrency(reportData.summary.totalExpenses)}</p>
          <p className={`text-xs mt-1 ${getChangeTone(reportData.comparison.expensesChange, true)}`}>
            {getChangeLabel(reportData.comparison.expensesChange)}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-cargo-muted mb-1">Net Profit</p>
          <p className="text-2xl font-bold text-cargo-text">{formatCurrency(reportData.summary.netProfit)}</p>
          <p className={`text-xs mt-1 ${getChangeTone(reportData.comparison.netProfitChange)}`}>
            {getChangeLabel(reportData.comparison.netProfitChange)}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-cargo-muted mb-1">Total Trips</p>
          <p className="text-2xl font-bold text-cargo-text">{reportData.summary.totalTrips}</p>
          <p className={`text-xs mt-1 ${getChangeTone(reportData.comparison.tripsChange)}`}>
            {getChangeLabel(reportData.comparison.tripsChange)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-semibold text-cargo-text mb-6">{chartConfig.title}</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={reportData.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="label" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip
                  formatter={(value) => chartConfig.formatter(value)}
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey={chartConfig.dataKey}
                  stroke={chartConfig.color}
                  strokeWidth={3}
                  dot={{ fill: chartConfig.color }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold text-cargo-text mb-6">Expense Breakdown</h3>
          {reportData.expenseBreakdown.length === 0 ? (
            <p className="text-cargo-muted">No expense data found for this period.</p>
          ) : (
            <div className="space-y-4">
              {reportData.expenseBreakdown.map((item) => (
                <div key={item.category}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-cargo-text capitalize">{item.category}</span>
                    <span className="text-sm text-cargo-muted">
                      {formatCurrency(item.amount)} ({item.percentage}%)
                    </span>
                  </div>
                  <div className="w-full bg-cargo-dark rounded-full h-2">
                    <div
                      className="bg-primary-600 h-2 rounded-full transition-all"
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h3 className="text-lg font-semibold text-cargo-text mb-4">Revenue vs Expenses</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={reportData.trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="label" stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip
                formatter={(value) => formatCurrency(value)}
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                }}
              />
              <Bar dataKey="revenue" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              <Bar dataKey="expenses" fill="#ef4444" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <FileText className="w-5 h-5 text-primary-400" />
          <h3 className="text-lg font-semibold text-cargo-text">Recent Completed Trips</h3>
        </div>
        {reportData.recentTrips.length === 0 ? (
          <p className="text-cargo-muted">No completed trips found for this period.</p>
        ) : (
          <div className="space-y-3">
            {reportData.recentTrips.map((trip) => (
              <div key={trip.id} className="flex flex-col gap-3 p-4 bg-cargo-dark rounded-lg lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-medium text-cargo-text">
                    {trip.source} to {trip.destination}
                  </p>
                  <p className="text-xs text-cargo-muted mt-1">
                    {trip.driver_name} • {trip.car_number} • {format(new Date(trip.started_at), 'PPP')}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <span className="text-cargo-text">Revenue: {formatCurrency(trip.freight_charge)}</span>
                  <span className="text-cargo-muted">Expenses: {formatCurrency(trip.total_expenses)}</span>
                  <span className="text-primary-400">Net: {formatCurrency(trip.net_profit)}</span>
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
