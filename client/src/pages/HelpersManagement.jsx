import { useEffect, useState } from 'react';
import { HandHelping, Plus, Save } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import Modal from '../components/common/Modal';

const defaultForm = {
  helper_name: '',
  phone_number: '',
  salary_amount: '',
  status: 'active',
};

const formatCurrency = (value) => `Rs ${Number(value || 0).toLocaleString()}`;

const HelpersManagement = () => {
  const { get, post, put, loading } = useApi();
  const [helpers, setHelpers] = useState([]);
  const [selectedHelper, setSelectedHelper] = useState(null);
  const [formData, setFormData] = useState(defaultForm);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const fetchHelpers = async () => {
    const result = await get('/admin/helpers');
    if (result.success) {
      setHelpers(result.data.helpers || []);
    }
  };

  useEffect(() => {
    fetchHelpers();
  }, []);

  const resetForm = () => setFormData(defaultForm);

  const handleAdd = async (e) => {
    e.preventDefault();
    const result = await post('/admin/helpers', formData);
    if (!result.success) {
      alert(result.error);
      return;
    }

    setIsAddOpen(false);
    resetForm();
    fetchHelpers();
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!selectedHelper) return;

    const result = await put(`/admin/helpers/${selectedHelper.id}`, formData);
    if (!result.success) {
      alert(result.error);
      return;
    }

    setIsEditOpen(false);
    setSelectedHelper(null);
    resetForm();
    fetchHelpers();
  };

  const openEdit = (helper) => {
    setSelectedHelper(helper);
    setFormData({
      helper_name: helper.helper_name || '',
      phone_number: helper.phone_number || '',
      salary_amount: helper.salary_amount || '',
      status: helper.status || 'active',
    });
    setIsEditOpen(true);
  };

  const renderForm = (isEditing = false) => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-cargo-text mb-2">Helper Name</label>
        <input
          type="text"
          required
          value={formData.helper_name}
          onChange={(e) => setFormData((prev) => ({ ...prev, helper_name: e.target.value }))}
          className="input-field w-full"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-cargo-text mb-2">Helper Phone Number</label>
        <input
          type="text"
          value={formData.phone_number}
          onChange={(e) => setFormData((prev) => ({ ...prev, phone_number: e.target.value }))}
          className="input-field w-full"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-cargo-text mb-2">Helper Salary</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={formData.salary_amount}
          onChange={(e) => setFormData((prev) => ({ ...prev, salary_amount: e.target.value }))}
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
          </select>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-cargo-text">Helper Management</h1>
        </div>
        <button onClick={() => setIsAddOpen(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Add Helper
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {helpers.map((helper) => (
          <div key={helper.id} className="card space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-cargo-border flex items-center justify-center">
                <HandHelping className="w-6 h-6 text-cargo-muted" />
              </div>
              <div>
                <h3 className="font-semibold text-cargo-text">{helper.helper_name}</h3>
                <p className="text-xs text-cargo-muted">{helper.phone_number || 'No phone number'}</p>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <p className="text-cargo-text">Salary: <span className="text-primary-400 font-semibold">{formatCurrency(helper.salary_amount)}</span></p>
              <p className="text-cargo-text">Available Amount: <span className="text-primary-400 font-semibold">{formatCurrency(helper.available_balance)}</span></p>
              <p className="text-cargo-text">Driver: <span className="text-cargo-muted">{helper.driver_full_name || helper.driver_username || 'Unassigned'}</span></p>
              <p className="text-cargo-text">Car: <span className="text-cargo-muted">{helper.car_number || 'No car linked'}</span></p>
              <p className="text-cargo-text">Status: <span className="capitalize text-cargo-muted">{helper.status}</span></p>
            </div>

            <button onClick={() => openEdit(helper)} className="btn-secondary w-full flex items-center justify-center gap-2">
              <Save className="w-4 h-4" />
              Edit Helper
            </button>
          </div>
        ))}
      </div>

      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Add Helper">
        <form onSubmit={handleAdd} className="space-y-4">
          {renderForm(false)}
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={() => setIsAddOpen(false)} className="flex-1 btn-secondary">Cancel</button>
            <button type="submit" className="flex-1 btn-primary">Create Helper</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} title={`Edit ${selectedHelper?.helper_name || 'Helper'}`}>
        <form onSubmit={handleEdit} className="space-y-4">
          {renderForm(true)}
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={() => setIsEditOpen(false)} className="flex-1 btn-secondary">Cancel</button>
            <button type="submit" className="flex-1 btn-primary">Save Changes</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default HelpersManagement;
