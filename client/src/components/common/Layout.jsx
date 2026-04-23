import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import Sidebar from './Sidebar';

const Layout = () => {
  return (
    <div className="min-h-screen bg-cargo-dark">
      <Navbar />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6 ml-64 mt-16 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;