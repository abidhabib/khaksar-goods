import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Login from './pages/Login'
import AdminDashboard from './pages/AdminDashboard'
import CarsManagement from './pages/CarsManagement'
import DriversManagement from './pages/DriversManagement'
import CarReportPage from './pages/CarReportPage'
import DriverReportPage from './pages/DriverReportPage'
import DriverExpensesReportPage from './pages/DriverExpensesReportPage'
import TripMonitor from './pages/TripMonitor'
import Reports from './pages/Reports'
import ProtectedRoute from './components/common/ProtectedRoute'
import Layout from './components/common/Layout'

function App() {
  const { user } = useAuth()

  return (
    <Routes>
      <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />

      <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
        <Route element={<Layout />}>
          <Route path="/" element={<AdminDashboard />} />
          <Route path="/cars" element={<CarsManagement />} />
          <Route path="/cars/:id/report" element={<CarReportPage />} />
          <Route path="/drivers" element={<DriversManagement />} />
          <Route path="/drivers/:id/report" element={<DriverReportPage />} />
          <Route path="/drivers-expenses" element={<DriverExpensesReportPage />} />
          <Route path="/trips" element={<TripMonitor />} />
          <Route path="/reports" element={<Reports />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}

export default App
