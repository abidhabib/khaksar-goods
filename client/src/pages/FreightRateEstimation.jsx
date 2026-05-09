import { useEffect, useMemo, useState } from 'react';
import { Calculator, Pencil, Plus, Trash2, Truck } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import Modal from '../components/common/Modal';

const emptyRateForm = {
  weight_ton: '',
  rate_per_km: '',
  notes: '',
};

const emptyCalculationForm = {
  weight_ton: '',
  distance_km: '',
};

const FreightRateEstimation = () => {
  const { get, post, put, del, loading } = useApi();
  const [rates, setRates] = useState([]);
  const [selectedRate, setSelectedRate] = useState(null);
  const [rateForm, setRateForm] = useState(emptyRateForm);
  const [calculationForm, setCalculationForm] = useState(emptyCalculationForm);
  const [estimate, setEstimate] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);

  useEffect(() => {
    fetchRates();
  }, [get]);

  const fetchRates = async () => {
    const result = await get('/admin/freight-rates');
    if (result.success) {
      setRates(result.data.rates || []);
    }
  };

  const resetRateForm = () => {
    setRateForm(emptyRateForm);
    setSelectedRate(null);
  };

  const handleAddRate = async (e) => {
    e.preventDefault();

    const result = await post('/admin/freight-rates', rateForm);
    if (!result.success) {
      alert(result.error);
      return;
    }

    setIsAddModalOpen(false);
    resetRateForm();
    fetchRates();
  };

  const handleEditRate = async (e) => {
    e.preventDefault();
    if (!selectedRate) return;

    const result = await put(`/admin/freight-rates/${selectedRate.id}`, rateForm);
    if (!result.success) {
      alert(result.error);
      return;
    }

    setIsEditModalOpen(false);
    resetRateForm();
    fetchRates();
  };

  const handleDeleteRate = async (rate) => {
    if (!window.confirm(`Delete ${rate.weight_ton} ton freight rate?`)) {
      return;
    }

    const result = await del(`/admin/freight-rates/${rate.id}`);
    if (!result.success) {
      alert(result.error);
      return;
    }

    if (selectedRate?.id === rate.id) {
      resetRateForm();
    }
    fetchRates();
  };

  const handleCalculate = async (e) => {
    e.preventDefault();
    setIsCalculating(true);

    const result = await get('/admin/freight-rates/calculate', {
      params: calculationForm,
    });

    setIsCalculating(false);

    if (!result.success) {
      setEstimate(null);
      alert(result.error);
      return;
    }

    setEstimate(result.data.estimate || null);
  };

  const openEditModal = (rate) => {
    setSelectedRate(rate);
    setRateForm({
      weight_ton: String(rate.weight_ton ?? ''),
      rate_per_km: String(rate.rate_per_km ?? ''),
      notes: rate.notes || '',
    });
    setIsEditModalOpen(true);
  };

  const sortedRates = useMemo(
    () => [...rates].sort((a, b) => Number(a.weight_ton) - Number(b.weight_ton)),
    [rates]
  );

  const formatCurrency = (value) => new Intl.NumberFormat('en-PK', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(Number(value) || 0);

  const renderRateForm = (submitLabel) => (
    <form onSubmit={submitLabel === 'Add Rate' ? handleAddRate : handleEditRate} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-cargo-text mb-2">Weight (ton)</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            required
            value={rateForm.weight_ton}
            onChange={(e) => setRateForm((prev) => ({ ...prev, weight_ton: e.target.value }))}
            className="input-field w-full"
            placeholder="3"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-cargo-text mb-2">Rate per km</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            required
            value={rateForm.rate_per_km}
            onChange={(e) => setRateForm((prev) => ({ ...prev, rate_per_km: e.target.value }))}
            className="input-field w-full"
            placeholder="100"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-cargo-text mb-2">Notes</label>
        <input
          type="text"
          value={rateForm.notes}
          onChange={(e) => setRateForm((prev) => ({ ...prev, notes: e.target.value }))}
          className="input-field w-full"
          placeholder="Optional"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => {
            setIsAddModalOpen(false);
            setIsEditModalOpen(false);
            resetRateForm();
          }}
          className="flex-1 btn-secondary"
        >
          Cancel
        </button>
        <button type="submit" className="flex-1 btn-primary">
          {submitLabel}
        </button>
      </div>
    </form>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-cargo-text">Karya Estimation</h1>
          <p className="text-cargo-muted mt-1">
            Save per-km Karya rates by ton, then calculate total Karaya charge for  distance.
          </p>
        </div>
        <button
          onClick={() => {
            resetRateForm();
            setIsAddModalOpen(true);
          }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Add Rate
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
        <section className="card">
          <div className="flex items-center gap-3 mb-4">
            <Truck className="w-5 h-5 text-primary-400" />
            <div>
              <h2 className="text-lg font-semibold text-cargo-text">Saved Freight Rates</h2>
              <p className="text-sm text-cargo-muted">Add, edit, or remove ton-based rates.</p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : sortedRates.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-cargo-border text-left text-cargo-muted">
                    <th className="py-3 pr-4 font-medium">Weight</th>
                    <th className="py-3 pr-4 font-medium">Rate / km</th>
                    <th className="py-3 pr-4 font-medium">Notes</th>
                    <th className="py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRates.map((rate) => (
                    <tr key={rate.id} className="border-b border-cargo-border/60">
                      <td className="py-4 pr-4 text-cargo-text font-medium">{rate.weight_ton} ton</td>
                      <td className="py-4 pr-4 text-cargo-text">Rs {formatCurrency(rate.rate_per_km)}</td>
                      <td className="py-4 pr-4 text-cargo-muted">{rate.notes || '-'}</td>
                      <td className="py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(rate)}
                            className="btn-secondary flex items-center gap-2 text-sm py-2"
                          >
                            <Pencil className="w-4 h-4" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRate(rate)}
                            className="px-4 py-2 rounded-lg font-medium bg-red-500/15 text-red-300 hover:bg-red-500/25 transition-colors flex items-center gap-2"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-cargo-border p-8 text-center">
              <p className="text-cargo-text font-medium">No freight rates saved yet.</p>
              <p className="text-cargo-muted text-sm mt-2">Add rates like 3 ton, 5 ton, 6 ton, 7 ton per km.</p>
            </div>
          )}
        </section>

        <section className="card">
          <div className="flex items-center gap-3 mb-4">
            <Calculator className="w-5 h-5 text-primary-400" />
            <div>
              <h2 className="text-lg font-semibold text-cargo-text">Rate Calculator</h2>
              <p className="text-sm text-cargo-muted">Check total freight charge for a weight and distance.</p>
            </div>
          </div>

          <form onSubmit={handleCalculate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-cargo-text mb-2">Weight (ton)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                value={calculationForm.weight_ton}
                onChange={(e) => setCalculationForm((prev) => ({ ...prev, weight_ton: e.target.value }))}
                className="input-field w-full"
                placeholder="2.5 or 3"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-cargo-text mb-2">Distance (km)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                value={calculationForm.distance_km}
                onChange={(e) => setCalculationForm((prev) => ({ ...prev, distance_km: e.target.value }))}
                className="input-field w-full"
                placeholder="500"
              />
            </div>

            <button type="submit" className="w-full btn-primary">
              {isCalculating ? 'Calculating...' : 'Calculate'}
            </button>
          </form>

          {estimate ? (
            <div className="mt-6 space-y-3 rounded-xl border border-primary-500/20 bg-primary-500/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-cargo-muted">Applied rate</span>
                <span className="text-cargo-text font-semibold">Rs {formatCurrency(estimate.applied_rate_per_km)} / km</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-cargo-muted">Weight</span>
                <span className="text-cargo-text font-semibold">{estimate.requested_weight_ton} ton</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-cargo-muted">Distance</span>
                <span className="text-cargo-text font-semibold">{estimate.requested_distance_km} km</span>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-cargo-border pt-3">
                <span className="text-cargo-muted">Total freight charge</span>
                <span className="text-xl font-bold text-primary-300">Rs {formatCurrency(estimate.total_freight_charge)}</span>
              </div>
              <p className="text-xs text-cargo-muted">
                Calculation mode: {estimate.calculation_mode}
              </p>
            </div>
          ) : null}
        </section>
      </div>

      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Add Freight Rate">
        {renderRateForm('Add Rate')}
      </Modal>

      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit Freight Rate">
        {renderRateForm('Save Changes')}
      </Modal>
    </div>
  );
};

export default FreightRateEstimation;
