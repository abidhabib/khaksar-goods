import { TrendingUp, TrendingDown } from 'lucide-react';

const StatCard = ({ title, value,  trend, trendUp, icon: Icon, color = 'blue' }) => {
  const colorClasses = {
    blue: 'bg-blue-500/10 text-blue-400',
    green: 'bg-green-500/10 text-green-400',
    amber: 'bg-amber-500/10 text-amber-400',
    red: 'bg-red-500/10 text-red-400',
    purple: 'bg-purple-500/10 text-purple-400'
  };

  return (
    <div className="rounded-lg border border-cargo-border bg-cargo-card p-3 hover:border-cargo-text/20 transition-all ">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs text-cargo-muted mb-1">{title}</p>
          <h3 className="text-xl font-bold text-cargo-text">{value}</h3>
          
          {trend && (
            <div className={`flex items-center gap-1 mt-2 text-xs ${trendUp ? 'text-cargo-success' : 'text-cargo-danger'}`}>
              {trendUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              <span>{trend}</span>
            </div>
          )}
        </div>
        
        {Icon && (
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorClasses[color]}`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
    </div>
  );
};

export default StatCard;
