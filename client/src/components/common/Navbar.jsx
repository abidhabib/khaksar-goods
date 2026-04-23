
import { useAuth } from '../../hooks/useAuth';
import { Truck, Bell, User, LogOut } from 'lucide-react';

const Navbar = () => {
  const { user, logout } = useAuth();

  return (
    <nav className="fixed top-0 left-0 right-0 h-16 bg-cargo-card border-b border-cargo-border z-50 flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
          <Truck className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-cargo-text">Cargo Tracker</h1>
          <p className="text-xs text-cargo-muted">Admin Panel</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button className="relative p-2 text-cargo-muted hover:text-cargo-text transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-cargo-accent rounded-full"></span>
        </button>
        
        <div className="flex items-center gap-3 pl-4 border-l border-cargo-border">
          <div className="w-8 h-8 bg-cargo-border rounded-full flex items-center justify-center">
            <User className="w-4 h-4 text-cargo-muted" />
          </div>
          <div className="hidden md:block">
            <p className="text-sm font-medium text-cargo-text">{user?.username}</p>
            <p className="text-xs text-cargo-muted capitalize">{user?.role}</p>
          </div>
          <button 
            onClick={logout}
            className="p-2 text-cargo-muted hover:text-cargo-danger transition-colors"
            title="Logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;