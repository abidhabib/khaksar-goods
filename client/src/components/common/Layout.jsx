import { Outlet } from 'react-router-dom';
import { useState } from 'react';
import Navbar from './Navbar';
import Sidebar from './Sidebar';

const Layout = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-cargo-dark">
      <Navbar
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
      />
      <div className="flex">
        <Sidebar collapsed={sidebarCollapsed} />
        <main className={`flex-1 p-6 mt-16 overflow-auto transition-all duration-300 ${sidebarCollapsed ? 'ml-20' : 'ml-64'}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
