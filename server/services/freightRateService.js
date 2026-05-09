const pool = require('../config/database');

const roundTo = (value, digits = 2) => {
    const factor = 10 ** digits;
    return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};

const parsePositiveNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const mapRateRow = (row) => ({
    id: row.id,
    weight_ton: roundTo(row.weight_ton),
    rate_per_km: roundTo(row.rate_per_km),
    notes: row.notes || '',
    created_at: row.created_at,
    updated_at: row.updated_at
});

const getFreightRates = async () => {
    const [rows] = await pool.execute(
        `SELECT id, weight_ton, rate_per_km, notes, created_at, updated_at
         FROM freight_rate_cards
         ORDER BY weight_ton ASC, id ASC`
    );

    return rows.map(mapRateRow);
};

const calculateFreightEstimateFromRates = ({ weightTon, distanceKm, rates }) => {
    const normalizedWeight = parsePositiveNumber(weightTon);
    const normalizedDistance = parsePositiveNumber(distanceKm);

    if (!normalizedWeight || !normalizedDistance) {
        throw new Error('Weight and distance must be greater than zero');
    }

    if (!Array.isArray(rates) || !rates.length) {
        throw new Error('No freight rates saved yet');
    }

    const normalizedRates = rates.map(mapRateRow).sort((a, b) => a.weight_ton - b.weight_ton);
    const exactRate = normalizedRates.find((rate) => Math.abs(rate.weight_ton - normalizedWeight) < 0.0001);
    const lowerRate = [...normalizedRates].reverse().find((rate) => rate.weight_ton <= normalizedWeight) || null;
    const upperRate = normalizedRates.find((rate) => rate.weight_ton >= normalizedWeight) || null;
    const appliedRatePerKm = exactRate
        ? roundTo(exactRate.rate_per_km)
        : interpolateRate(normalizedWeight, lowerRate, upperRate);

    return {
        requested_weight_ton: roundTo(normalizedWeight),
        requested_distance_km: roundTo(normalizedDistance),
        applied_rate_per_km: appliedRatePerKm,
        total_freight_charge: roundTo(appliedRatePerKm * normalizedDistance),
        calculation_mode: exactRate
            ? 'exact'
            : lowerRate && upperRate
                ? 'interpolated'
                : 'scaled',
        matched_rate: exactRate,
        lower_rate: lowerRate,
        upper_rate: upperRate,
        available_rates: normalizedRates
    };
};

const interpolateRate = (requestedWeight, lowerRate, upperRate) => {
    if (!lowerRate && !upperRate) {
        return null;
    }

    if (lowerRate && upperRate && lowerRate.weight_ton === upperRate.weight_ton) {
        return roundTo(lowerRate.rate_per_km);
    }

    if (!lowerRate) {
        return roundTo((requestedWeight / upperRate.weight_ton) * upperRate.rate_per_km);
    }

    if (!upperRate) {
        return roundTo((requestedWeight / lowerRate.weight_ton) * lowerRate.rate_per_km);
    }

    const span = upperRate.weight_ton - lowerRate.weight_ton;
    if (span <= 0) {
        return roundTo(lowerRate.rate_per_km);
    }

    const ratio = (requestedWeight - lowerRate.weight_ton) / span;
    return roundTo(lowerRate.rate_per_km + ((upperRate.rate_per_km - lowerRate.rate_per_km) * ratio));
};

const calculateFreightEstimate = async ({ weightTon, distanceKm }) => {
    const rates = await getFreightRates();
    return calculateFreightEstimateFromRates({ weightTon, distanceKm, rates });
};

module.exports = {
    getFreightRates,
    calculateFreightEstimate,
    calculateFreightEstimateFromRates,
    parsePositiveNumber,
    roundTo
};
