
import { useAuth } from '../../hooks/useAuth';
import { Truck, Bell, User, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

const Navbar = ({ sidebarCollapsed = false, onToggleSidebar }) => {
  const { user, logout } = useAuth();

  return (
    <nav className="fixed top-0 left-0 right-0 h-16 bg-cargo-card border-b border-cargo-border z-50 flex items-center justify-between px-4 md:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="p-2 rounded-lg text-cargo-muted hover:text-cargo-text hover:bg-cargo-border transition-colors"
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
        </button>
        <div className="w-7 h-7 bg-primary-600 rounded-lg flex items-center justify-center">
          <Truck className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-base md:text-lg font-bold text-cargo-text">Khaksar Goods</h1>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        
        
        <div className="flex items-center gap-2 md:gap-3 pl-2 md:pl-4 border-l border-cargo-border">
       
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
