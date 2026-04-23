import { useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import DriverCard from '../components/admin/DriverCard';
import Modal from '../components/common/Modal';

const DriversManagement = () => {
  const { get, post, put, loading } = useApi();
  const navigate = useNavigate();
  const [drivers, setDrivers] = useState([]);
  const [cars, setCars] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    password: '',
    license_number: '',
    car_id: '',
    status: 'active',
  });

  useEffect(() => {
    const loadPage = async () => {
      await Promise.all([fetchDrivers(), fetchCars()]);
    };

    loadPage();
  }, [get]);

  const fetchDrivers = async () => {
    const result = await get('/admin/drivers');
    if (result.success) {
      setDrivers(result.data.drivers);
    }
  };

  const fetchCars = async () => {
    const result = await get('/admin/cars');
    if (result.success) {
      setCars(result.data.cars.filter((car) => car.status === 'active'));
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      phone: '',
      password: '',
      license_number: '',
      car_id: '',
      status: 'active',
    });
  };

  const handleAddDriver = async (e) => {
    e.preventDefault();
    const result = await post('/admin/drivers', formData);
    if (result.success) {
      setIsAddModalOpen(false);
      resetForm();
      fetchDrivers();
      fetchCars();
    } else {
      alert(result.error);
    }
  };

  const handleAssignCar = async (e) => {
    e.preventDefault();

    if (!selectedDriver) {
      return;
    }

    const result = await post('/admin/drivers/assign-car', {
      driver_id: selectedDriver.id,
      car_id: formData.car_id,
    });
    if (result.success) {
      setIsAssignModalOpen(false);
      setSelectedDriver(null);
      setFormData((prev) => ({ ...prev, car_id: '' }));
      fetchDrivers();
      fetchCars();
    } else {
      alert(result.error);
    }
  };

  const handleEditDriver = async (e) => {
    e.preventDefault();

    if (!selectedDriver) {
      return;
    }

    const payload = {
      phone: formData.phone,
      status: formData.status,
      license_number: formData.license_number,
      car_id: formData.car_id,
    };

    if (formData.password) {
      payload.password = formData.password;
    }

    const result = await put(`/admin/drivers/${selectedDriver.id}`, payload);
    if (result.success) {
      setIsEditModalOpen(false);
      setSelectedDriver(null);
      resetForm();
      fetchDrivers();
      fetchCars();
    } else {
      alert(result.error);
    }
  };

  const openAssignModal = (driver) => {
    setSelectedDriver(driver);
    setFormData((prev) => ({ ...prev, car_id: driver.car_id ? String(driver.car_id) : '' }));
    setIsAssignModalOpen(true);
  };

  const openEditModal = (driver) => {
    setSelectedDriver(driver);
    setFormData({
      name: driver.username,
      phone: driver.phone || '',
      password: '',
      license_number: driver.license_number || '',
      car_id: driver.car_id ? String(driver.car_id) : '',
      status: driver.status || 'active',
    });
    setIsEditModalOpen(true);
  };

  const openReportPage = (driverId) => {
    navigate(`/drivers/${driverId}/report`);
  };

  const filteredDrivers = drivers.filter((driver) =>
    driver.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    driver.phone?.includes(searchTerm)
  );

  const availableCars = cars.filter(
    (car) => !car.driver_id || car.driver_id === selectedDriver?.id
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-cargo-text">Driver Management</h1>
          <p className="text-cargo-muted mt-1">Manage drivers, credentials, cargo assignments, and reports</p>
        </div>
        <button onClick={() => setIsAddModalOpen(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Add Driver
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-cargo-muted" />
        <input
          type="text"
          placeholder="Search drivers..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="input-field w-full pl-10"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDrivers.map((driver) => (
            <DriverCard
              key={driver.id}
              driver={driver}
              onEdit={openEditModal}
              onAssign={openAssignModal}
              onViewReport={openReportPage}
            />
          ))}
        </div>
      )}

      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Add New Driver">
        <form onSubmit={handleAddDriver} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-cargo-text mb-2">Full Name</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              className="input-field w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-cargo-text mb-2">Phone Number</label>
            <input
              type="tel"
              required
              value={formData.phone}
              onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
              className="input-field w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-cargo-text mb-2">Password</label>
            <input
              type="password"
              required
              value={formData.password}
              onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
              className="input-field w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-cargo-text mb-2">License Number</label>
            <input
              type="text"
              value={formData.license_number}
              onChange={(e) => setFormData((prev) => ({ ...prev, license_number: e.target.value }))}
              className="input-field w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-cargo-text mb-2">Assign Cargo</label>
            <select
              value={formData.car_id}
              onChange={(e) => setFormData((prev) => ({ ...prev, car_id: e.target.value }))}
              className="input-field w-full"
            >
              <option value="">No Cargo</option>
              {cars.filter((car) => !car.driver_id).map((car) => (
                <option key={car.id} value={car.id}>{car.car_number}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={() => setIsAddModalOpen(false)} className="flex-1 btn-secondary">Cancel</button>
            <button type="submit" className="flex-1 btn-primary">Add Driver</button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        title={`Assign Cargo to ${selectedDriver?.username || ''}`}
      >
        <form onSubmit={handleAssignCar} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-cargo-text mb-2">Select Cargo</label>
            <select
              value={formData.car_id}
              onChange={(e) => setFormData((prev) => ({ ...prev, car_id: e.target.value }))}
              className="input-field w-full"
            >
              <option value="">No Cargo (Unassign)</option>
              {availableCars.map((car) => (
                <option key={car.id} value={car.id}>{car.car_number}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={() => setIsAssignModalOpen(false)} className="flex-1 btn-secondary">Cancel</button>
            <button type="submit" className="flex-1 btn-primary">Save Assignment</button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={`Edit Driver ${selectedDriver?.username || ''}`}
      >
        <form onSubmit={handleEditDriver} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-cargo-text mb-2">Username</label>
            <input type="text" value={formData.name} disabled className="input-field w-full opacity-70" />
          </div>
          <div>
            <label className="block text-sm font-medium text-cargo-text mb-2">Phone Number</label>
            <input
              type="tel"
              required
              value={formData.phone}
              onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
              className="input-field w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-cargo-text mb-2">License Number</label>
            <input
              type="text"
              value={formData.license_number}
              onChange={(e) => setFormData((prev) => ({ ...prev, license_number: e.target.value }))}
              className="input-field w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-cargo-text mb-2">Status</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value }))}
              className="input-field w-full"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-cargo-text mb-2">Assigned Cargo</label>
            <select
              value={formData.car_id}
              onChange={(e) => setFormData((prev) => ({ ...prev, car_id: e.target.value }))}
              className="input-field w-full"
            >
              <option value="">No Cargo</option>
              {availableCars.map((car) => (
                <option key={car.id} value={car.id}>{car.car_number}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-cargo-text mb-2">New Password</label>
            <input
              type="password"
              placeholder="Leave blank to keep current password"
              value={formData.password}
              onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
              className="input-field w-full"
            />
            <p className="text-xs text-cargo-muted mt-2">
              Changing the password will force the driver to log in again on all devices.
            </p>
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={() => setIsEditModalOpen(false)} className="flex-1 btn-secondary">Cancel</button>
            <button type="submit" className="flex-1 btn-primary">Save Changes</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default DriversManagement;
