import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Car, 
  Users, 
  Route, 
  FileText,
  Settings 
} from 'lucide-react';

const Sidebar = () => {
  const menuItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/cars', icon: Car, label: 'Cars' },
    { path: '/drivers', icon: Users, label: 'Drivers' },
    { path: '/trips', icon: Route, label: 'Trips' },
    { path: '/drivers-expenses', icon: FileText, label: 'Drivers Expenses' },
    { path: '/reports', icon: FileText, label: 'Reports' },
  ];

  return (
    <aside className="fixed left-0 top-16 bottom-0 w-64 bg-cargo-card border-r border-cargo-border z-40">
      <div className="p-4">
        <nav className="space-y-1">
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => 
                `sidebar-link ${isActive ? 'active' : ''}`
              }
            >
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

       
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-4 bg-cargo-dark/50">
        <div className="text-xs text-cargo-muted">
          <p className='text-amber-500 mb-3 text-left'>
            Ch Ishaq Cargo
          </p>
          <p>© 2026 Cargo Tracker</p>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
