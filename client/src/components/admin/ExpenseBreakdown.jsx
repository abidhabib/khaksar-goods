import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

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

const ExpenseBreakdown = ({ data }) => {
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
  const chartData = Array.isArray(data) ? data.filter((item) => Number(item?.value) > 0) : [];

  return (
    <div className="card p-4 max-w-3xl">
      <h3 className="text-base font-semibold text-cargo-text mb-4">Expense Breakdown</h3>
      
      {chartData.length ? (
        <>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={74}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3">
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
        </>
      ) : (
        <div className="h-56 flex items-center justify-center text-sm text-cargo-muted">
          No monthly expenses found.
        </div>
      )}
    </div>
  );
};

export default ExpenseBreakdown;
