import { useEffect, useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import DriverCard from '../components/admin/DriverCard';
import Modal from '../components/common/Modal';

const defaultForm = {
  full_name: '',
  username: '',
  phone: '',
  password: '',
  license_number: '',
  salary_amount: '',
  commission_percentage: '',
  available_balance: '',
  commission_balance: '',
  joined_date: '',
  car_id: '',
  helper_id: '',
  status: 'active',
};

const defaultDepositForm = {
  amount: '',
  remarks: '',
};

const DriversManagement = () => {
  const { get, post, put, loading } = useApi();
  const navigate = useNavigate();
  const [drivers, setDrivers] = useState([]);
  const [cars, setCars] = useState([]);
  const [helpers, setHelpers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [formData, setFormData] = useState(defaultForm);
  const [depositForm, setDepositForm] = useState(defaultDepositForm);

  useEffect(() => {
    const loadPage = async () => {
      await Promise.all([fetchDrivers(), fetchCars(), fetchHelpers()]);
    };

    loadPage();
  }, [get]);

  const fetchDrivers = async () => {
    const result = await get('/admin/drivers');
    if (result.success) {
      setDrivers(result.data.drivers || []);
    }
  };

  const fetchCars = async () => {
    const result = await get('/admin/cars');
    if (result.success) {
      setCars((result.data.cars || []).filter((car) => car.status === 'active'));
    }
  };

  const fetchHelpers = async () => {
    const result = await get('/admin/helpers');
    if (result.success) {
      setHelpers((result.data.helpers || []).filter((helper) => helper.status === 'active'));
    }
  };

  const resetForm = () => setFormData(defaultForm);
  const resetDepositForm = () => setDepositForm(defaultDepositForm);

  const refreshAll = async () => {
    await Promise.all([fetchDrivers(), fetchCars(), fetchHelpers()]);
  };

  const handleAddDriver = async (e) => {
    e.preventDefault();
    const result = await post('/admin/drivers', {
      name: formData.full_name,
      username: formData.username,
      phone: formData.phone,
      password: formData.password,
      license_number: formData.license_number,
      salary_amount: formData.salary_amount,
      commission_percentage: formData.commission_percentage,
      available_balance: formData.available_balance,
      commission_balance: formData.commission_balance,
      joined_date: formData.joined_date,
      car_id: formData.car_id,
      helper_id: formData.helper_id,
    });
    if (result.success) {
      setIsAddModalOpen(false);
      resetForm();
      refreshAll();
    } else {
      alert(result.error);
    }
  };

  const handleAssignCar = async (e) => {
    e.preventDefault();
    if (!selectedDriver) return;

    const result = await post('/admin/drivers/assign-car', {
      driver_id: selectedDriver.id,
      car_id: formData.car_id,
    });
    if (result.success) {
      setIsAssignModalOpen(false);
      setSelectedDriver(null);
      setFormData((prev) => ({ ...prev, car_id: '' }));
      refreshAll();
    } else {
      alert(result.error);
    }
  };

  const handleEditDriver = async (e) => {
    e.preventDefault();
    if (!selectedDriver) return;

    const payload = {
      full_name: formData.full_name,
      username: formData.username,
      phone: formData.phone,
      status: formData.status,
      license_number: formData.license_number,
      salary_amount: formData.salary_amount,
      commission_percentage: formData.commission_percentage,
      available_balance: formData.available_balance,
      commission_balance: formData.commission_balance,
      joined_date: formData.joined_date,
      car_id: formData.car_id,
      helper_id: formData.helper_id,
    };

    if (formData.password) {
      payload.password = formData.password;
    }

    const result = await put(`/admin/drivers/${selectedDriver.id}`, payload);
    if (result.success) {
      setIsEditModalOpen(false);
      setSelectedDriver(null);
      resetForm();
      refreshAll();
    } else {
      alert(result.error);
    }
  };

  const handleDeposit = async (e) => {
    e.preventDefault();
    if (!selectedDriver) return;

    const result = await post(`/admin/drivers/${selectedDriver.id}/company-deposits`, {
      amount: depositForm.amount,
      remarks: depositForm.remarks,
    });

    if (result.success) {
      setIsDepositModalOpen(false);
      setSelectedDriver(null);
      resetDepositForm();
      refreshAll();
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
      full_name: driver.full_name || driver.username || '',
      username: driver.username || '',
      phone: driver.phone || '',
      password: '',
      license_number: driver.license_number || '',
      salary_amount: driver.salary_amount || '',
      commission_percentage: driver.commission_percentage || '',
      available_balance: driver.available_balance || '',
      commission_balance: driver.commission_balance || '',
      joined_date: driver.joined_date ? String(driver.joined_date).slice(0, 10) : '',
      car_id: driver.car_id ? String(driver.car_id) : '',
      helper_id: driver.helper_id ? String(driver.helper_id) : '',
      status: driver.status || 'active',
    });
    setIsEditModalOpen(true);
  };

  const openDepositModal = (driver) => {
    setSelectedDriver(driver);
    resetDepositForm();
    setIsDepositModalOpen(true);
  };

  const openReportPage = (driverId) => navigate(`/drivers/${driverId}/report`);
  const openCashoutPage = (driver) => navigate(`/drivers/${driver.id}/cashout-history`, {
    state: {
      driverName: driver.full_name || driver.username || '',
      driverUsername: driver.username || '',
    }
  });
  const openDepositHistoryPage = (driver) => navigate(`/drivers/${driver.id}/deposit-history`, {
    state: {
      driverName: driver.full_name || driver.username || '',
      driverUsername: driver.username || '',
    }
  });

  const filteredDrivers = useMemo(() => drivers.filter((driver) => {
    const term = searchTerm.toLowerCase();
    return (
      (driver.full_name || '').toLowerCase().includes(term) ||
      (driver.username || '').toLowerCase().includes(term) ||
      (driver.phone || '').includes(searchTerm) ||
      (driver.helper_name || '').toLowerCase().includes(term)
    );
  }), [drivers, searchTerm]);

  const availableCars = cars.filter((car) => !car.driver_id || car.driver_id === selectedDriver?.id);
  const availableHelpers = helpers.filter((helper) => !helper.driver_id || helper.driver_id === selectedDriver?.id);

  const renderDriverForm = (isEditing = false) => (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-cargo-text mb-2">Driver Name</label>
          <input
            type="text"
            required
            value={formData.full_name}
            onChange={(e) => setFormData((prev) => ({ ...prev, full_name: e.target.value }))}
            className="input-field w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-cargo-text mb-2">Username</label>
          <input
            type="text"
            required
            value={formData.username}
            onChange={(e) => setFormData((prev) => ({ ...prev, username: e.target.value }))}
            className="input-field w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-cargo-text mb-2">Phone Number</label>
          <input
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
            className="input-field w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-cargo-text mb-2">{isEditing ? 'New Password' : 'Password'}</label>
          <input
            type="password"
            required={!isEditing}
            placeholder={isEditing ? 'Leave blank to keep current password' : ''}
            value={formData.password}
            onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
            className="input-field w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-cargo-text mb-2">Driver Salary</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={formData.salary_amount}
            onChange={(e) => setFormData((prev) => ({ ...prev, salary_amount: e.target.value }))}
            className="input-field w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-cargo-text mb-2">Driver Commission %</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={formData.commission_percentage}
            onChange={(e) => setFormData((prev) => ({ ...prev, commission_percentage: e.target.value }))}
            className="input-field w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-cargo-text mb-2">Available Balance</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={formData.available_balance}
            onChange={(e) => setFormData((prev) => ({ ...prev, available_balance: e.target.value }))}
            className="input-field w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-cargo-text mb-2">Commission Balance</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={formData.commission_balance}
            onChange={(e) => setFormData((prev) => ({ ...prev, commission_balance: e.target.value }))}
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
            {availableCars.map((car) => (
              <option key={car.id} value={car.id}>{car.car_number}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-cargo-text mb-2">Assign Helper</label>
          <select
            value={formData.helper_id}
            onChange={(e) => setFormData((prev) => ({ ...prev, helper_id: e.target.value }))}
            className="input-field w-full"
          >
            <option value="">No Helper</option>
            {availableHelpers.map((helper) => (
              <option key={helper.id} value={helper.id}>{helper.helper_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-cargo-text mb-2">Joined Date</label>
          <input
            type="date"
            value={formData.joined_date}
            onChange={(e) => setFormData((prev) => ({ ...prev, joined_date: e.target.value }))}
            className="input-field w-full"
          />
        </div>
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

      {isEditing ? (
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
      ) : null}
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-cargo-text">Driver Management</h1>
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
          placeholder="Search drivers or helpers..."
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
              onViewCashout={openCashoutPage}
              onDeposit={openDepositModal}
              onViewDeposits={openDepositHistoryPage}
            />
          ))}
        </div>
      )}

      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Add New Driver">
        <form onSubmit={handleAddDriver} className="space-y-4">
          {renderDriverForm(false)}
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={() => setIsAddModalOpen(false)} className="flex-1 btn-secondary">Cancel</button>
            <button type="submit" className="flex-1 btn-primary">Add Driver</button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        title={`Assign Cargo to ${selectedDriver?.full_name || selectedDriver?.username || ''}`}
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
        title={`Edit Driver ${selectedDriver?.full_name || selectedDriver?.username || ''}`}
      >
        <form onSubmit={handleEditDriver} className="space-y-4">
          {renderDriverForm(true)}
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={() => setIsEditModalOpen(false)} className="flex-1 btn-secondary">Cancel</button>
            <button type="submit" className="flex-1 btn-primary">Save Changes</button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isDepositModalOpen}
        onClose={() => setIsDepositModalOpen(false)}
        title={`Deposit Company Amount to ${selectedDriver?.full_name || selectedDriver?.username || ''}`}
      >
        <form onSubmit={handleDeposit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-cargo-text mb-2">Deposit Amount</label>
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={depositForm.amount}
              onChange={(e) => setDepositForm((prev) => ({ ...prev, amount: e.target.value }))}
              className="input-field w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-cargo-text mb-2">Remarks</label>
            <textarea
              rows="4"
              value={depositForm.remarks}
              onChange={(e) => setDepositForm((prev) => ({ ...prev, remarks: e.target.value }))}
              className="input-field w-full"
              placeholder="Optional note for this deposit"
            />
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={() => setIsDepositModalOpen(false)} className="flex-1 btn-secondary">Cancel</button>
            <button type="submit" className="flex-1 btn-primary">Save Deposit</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default DriversManagement;
