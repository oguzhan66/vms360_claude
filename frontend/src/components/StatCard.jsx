export const StatCard = ({ label, value, icon: Icon, variant = 'default', change, suffix = '' }) => {
  const variantClasses = {
    default: '',
    primary: 'primary',
    success: 'success',
    warning: 'warning',
    danger: 'danger',
  };

  return (
    <div className={`stat-card ${variantClasses[variant]}`} data-testid={`stat-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="stat-label text-xs uppercase tracking-wider font-medium">{label}</div>
          <div className="stat-value font-mono text-2xl font-bold mt-1">
            {typeof value === 'number' ? value.toLocaleString('tr-TR') : value}
            {suffix && <span className="text-base ml-1 opacity-60">{suffix}</span>}
          </div>
          {change !== undefined && (
            <div className={`stat-change text-sm mt-1 ${change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {change >= 0 ? '+' : ''}{change}%
            </div>
          )}
        </div>
        {Icon && (
          <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-primary" />
          </div>
        )}
      </div>
    </div>
  );
};

export default StatCard;
