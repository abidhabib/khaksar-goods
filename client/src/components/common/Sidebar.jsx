import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Car, 
  Users, 
  HandHelping,
  Route, 
  FileText,
  Wallet,
  Clock3,
  Calculator
} from 'lucide-react';

const Sidebar = ({ collapsed = false }) => {
  const menuItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/cars', icon: Car, label: 'Cars' },
    { path: '/drivers', icon: Users, label: 'Drivers' },
    { path: '/helpers', icon: HandHelping, label: 'Helpers' },
    { path: '/account-requests', icon: Wallet, label: 'Comission/Cashout' },
    { path: '/trips', icon: Route, label: 'Trips' },
    { path: '/drivers-expenses', icon: FileText, label: 'Drivers Expenses' },
    { path: '/payment-submissions', icon: Wallet, label: 'Payment' },
    { path: '/leave-requests', icon: Clock3, label: 'Leave Requests' },
    { path: '/reports', icon: FileText, label: 'Reports' },
    { path: '/rent-estimation', icon: Calculator, label: 'Rent Estimation' },
  ];

  return (
    <aside className={`fixed left-0 top-16 bottom-0 bg-cargo-card border-r border-cargo-border z-40 transition-all duration-300 ${collapsed ? 'w-20' : 'w-64'}`}>
      <div className="p-4">
        <nav className="space-y-1">
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) => 
                `sidebar-link ${collapsed ? 'justify-center px-2' : ''} ${isActive ? 'active' : ''}`
              }
            >
              <item.icon className="w-5 h-5" />
              {!collapsed ? <span>{item.label}</span> : null}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-4 bg-cargo-dark/50">
        <div className={`text-xs text-cargo-muted ${collapsed ? 'text-center' : ''}`}>
          {!collapsed ? (
            <>
              <p className='text-amber-500 mb-3 text-left'>
                Khaksar Goods
              </p>
              <p>© 2026 Cargo Tracker</p>
            </>
          ) : (
            <p>© 2026</p>
          )}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
