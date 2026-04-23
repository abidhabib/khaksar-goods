import { useEffect, useState } from 'react';
import { Plus, Search, Filter } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import CarCard from '../components/admin/CarCard';
import Modal from '../components/common/Modal';

const CarsManagement = () => {
  const { get, post, put, del, loading } = useApi();
  const navigate = useNavigate();
  const [cars, setCars] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedCar, setSelectedCar] = useState(null);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [formData, setFormData] = useState({
    car_number: '',
    current_meter_reading: 0,
    status: 'active',
  });

  useEffect(() => {
    const loadPage = async () => {
      await Promise.all([fetchCars(), fetchDrivers()]);
    };

    loadPage();
  }, [get]);

  const fetchCars = async () => {
    const result = await get('/admin/cars');
    if (result.success) {
      setCars(result.data.cars);
    }
  };

  const fetchDrivers = async () => {
    const result = await get('/admin/drivers');
    if (result.success) {
      setDrivers(result.data.drivers);
    }
  };

  const handleAddCar = async (e) => {
    e.preventDefault();
    const result = await post('/admin/cars', formData);
    if (result.success) {
      setIsAddModalOpen(false);
      setFormData({ car_number: '', current_meter_reading: 0, status: 'active' });
      fetchCars();
    } else {
      alert(result.error);
    }
  };

  const handleEditCar = async (e) => {
    e.preventDefault();

    if (!selectedCar) {
      return;
    }

    const result = await put(`/admin/cars/${selectedCar.id}`, formData);
    if (result.success) {
      setIsEditModalOpen(false);
      setSelectedCar(null);
      fetchCars();
      fetchDrivers();
    } else {
      alert(result.error);
    }
  };

  const handleDeleteCar = async (id) => {
    if (confirm('Are you sure you want to retire this car?')) {
      const result = await del(`/admin/cars/${id}`);
      if (result.success) {
        fetchCars();
        fetchDrivers();
      } else {
        alert(result.error);
      }
    }
  };

  const handleAssignDriver = async (e) => {
    e.preventDefault();

    if (!selectedCar) {
      return;
    }

    let result;

    if (!selectedDriverId && selectedCar.driver_id) {
      result = await post('/admin/drivers/assign-car', {
        driver_id: selectedCar.driver_id,
        car_id: '',
      });
    } else if (selectedDriverId) {
      result = await post('/admin/drivers/assign-car', {
        driver_id: Number(selectedDriverId),
        car_id: selectedCar.id,
      });
    } else {
      result = { success: true };
    }

    if (result.success) {
      setIsAssignModalOpen(false);
      setSelectedCar(null);
      setSelectedDriverId('');
      fetchCars();
      fetchDrivers();
    } else {
      alert(result.error);
    }
  };

  const openEditModal = (car) => {
    setSelectedCar(car);
    setFormData({
      car_number: car.car_number,
      current_meter_reading: Number(car.current_meter_reading) || 0,
      status: car.status,
    });
    setIsEditModalOpen(true);
  };

  const openAssignModal = (car) => {
    setSelectedCar(car);
    setSelectedDriverId(car.driver_id ? String(car.driver_id) : '');
    setIsAssignModalOpen(true);
  };

  const openReportPage = (car) => {
    navigate(`/cars/${car.id}/report`);
  };

  const filteredCars = cars.filter((car) =>
    car.car_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    car.assigned_driver?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const availableDrivers = drivers.filter(
    (driver) => driver.status === 'active' && (!driver.car_id || driver.car_id === selectedCar?.id)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-cargo-text">Cargo Management</h1>
          <p className="text-cargo-muted mt-1">Manage cargo, assignments, and detailed trip history</p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Add Cargo
        </button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-cargo-muted" />
          <input
            type="text"
            placeholder="Search by cargo number or driver..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field w-full pl-10"
          />
        </div>
        <button className="btn-secondary flex items-center gap-2" type="button">
          <Filter className="w-4 h-4" />
          {filteredCars.length} Cars
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCars.map((car) => (
            <CarCard
              key={car.id}
              car={car}
              onEdit={openEditModal}
              onDelete={handleDeleteCar}
              onAssign={openAssignModal}
              onViewHistory={openReportPage}
            />
          ))}
        </div>
      )}

      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Add New Car">
        <form onSubmit={handleAddCar} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-cargo-text mb-2">Car Number</label>
            <input
              type="text"
              required
              placeholder="e.g., ABC-123"
              value={formData.car_number}
              onChange={(e) => setFormData((prev) => ({ ...prev, car_number: e.target.value }))}
              className="input-field w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-cargo-text mb-2">Current Meter Reading</label>
            <input
              type="number"
              required
              min="0"
              value={formData.current_meter_reading}
              onChange={(e) => setFormData((prev) => ({ ...prev, current_meter_reading: Number(e.target.value) || 0 }))}
              className="input-field w-full"
            />
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={() => setIsAddModalOpen(false)} className="flex-1 btn-secondary">Cancel</button>
            <button type="submit" className="flex-1 btn-primary">Add Car</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit Car">
        <form onSubmit={handleEditCar} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-cargo-text mb-2">Car Number</label>
            <input
              type="text"
              required
              value={formData.car_number}
              onChange={(e) => setFormData((prev) => ({ ...prev, car_number: e.target.value }))}
              className="input-field w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-cargo-text mb-2">Current Meter Reading</label>
            <input
              type="number"
              required
              min="0"
              value={formData.current_meter_reading}
              onChange={(e) => setFormData((prev) => ({ ...prev, current_meter_reading: Number(e.target.value) || 0 }))}
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
              <option value="maintenance">Maintenance</option>
              <option value="retired">Retired</option>
            </select>
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={() => setIsEditModalOpen(false)} className="flex-1 btn-secondary">Cancel</button>
            <button type="submit" className="flex-1 btn-primary">Save Changes</button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        title={`Assign Driver to ${selectedCar?.car_number || ''}`}
      >
        <form onSubmit={handleAssignDriver} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-cargo-text mb-2">Select Driver</label>
            <select
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
              className="input-field w-full"
            >
              <option value="">No Driver (Unassign)</option>
              {availableDrivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.username} {driver.car_number ? `(currently ${driver.car_number})` : ''}
                </option>
              ))}
            </select>
          </div>
          <p className="text-sm text-cargo-muted">
            One cargo can only belong to one driver, and one driver can only keep one cargo at a time.
          </p>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={() => setIsAssignModalOpen(false)} className="flex-1 btn-secondary">Cancel</button>
            <button type="submit" className="flex-1 btn-primary">Save Assignment</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default CarsManagement;
