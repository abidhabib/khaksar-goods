import { TrendingUp, TrendingDown } from 'lucide-react';

const StatCard = ({ title, value, subtitle, trend, trendUp, icon: Icon, color = 'blue' }) => {
  const colorClasses = {
    blue: 'bg-blue-500/10 text-blue-400',
    green: 'bg-green-500/10 text-green-400',
    amber: 'bg-amber-500/10 text-amber-400',
    red: 'bg-red-500/10 text-red-400',
    purple: 'bg-purple-500/10 text-purple-400'
  };

  return (
    <div className="card hover:border-cargo-text/20 transition-all">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-cargo-muted mb-1">{title}</p>
          <h3 className="text-2xl font-bold text-cargo-text">{value}</h3>
          {subtitle && <p className="text-xs text-cargo-muted mt-1">{subtitle}</p>}
          
          {trend && (
            <div className={`flex items-center gap-1 mt-3 text-sm ${trendUp ? 'text-cargo-success' : 'text-cargo-danger'}`}>
              {trendUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span>{trend}</span>
            </div>
          )}
        </div>
        
        {Icon && (
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colorClasses[color]}`}>
            <Icon className="w-6 h-6" />
          </div>
        )}
      </div>
    </div>
  );
};

export default StatCard;