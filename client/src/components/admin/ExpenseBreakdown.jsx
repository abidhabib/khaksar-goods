import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const ExpenseBreakdown = ({ data }) => {
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

  const defaultData = [
    { name: 'Diesel', value: 40000 },
    { name: 'Toll', value: 15000 },
    { name: 'Food', value: 8000 },
    { name: 'Other', value: 5000 }
  ];

  const chartData = data || defaultData;

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-cargo-card border border-cargo-border rounded-lg p-3 shadow-xl">
          <p className="text-cargo-text font-medium">{payload[0].name}</p>
          <p className="text-primary-400">{payload[0].value?.toLocaleString()}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="card">
      <h3 className="text-lg font-semibold text-cargo-text mb-6">Expense Breakdown</h3>
      
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              verticalAlign="bottom" 
              height={36}
              iconType="circle"
              wrapperStyle={{ color: '#94a3b8' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-4">
        {chartData.map((item, index) => (
          <div key={item.name} className="flex items-center gap-2">
            <div 
              className="w-3 h-3 rounded-full" 
              style={{ backgroundColor: COLORS[index % COLORS.length] }}
            />
            <span className="text-sm text-cargo-muted">{item.name}</span>
            <span className="text-sm text-cargo-text font-medium ml-auto">
              {item.value?.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ExpenseBreakdown;