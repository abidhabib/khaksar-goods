// Generate username from name (for admin to easily create logins)
const generateUsername = (name, phone) => {
    const cleanName = name.toLowerCase().replace(/\s+/g, '');
    const last4Phone = phone.slice(-4);
    return `${cleanName}_${last4Phone}`;
};

// Validate meter reading progression
const validateMeterReading = (newReading, previousReading) => {
    if (newReading < previousReading) {
        return { valid: false, message: 'New reading cannot be less than previous reading' };
    }
    if (newReading === previousReading) {
        return { valid: false, message: 'New reading must be greater than previous reading' };
    }
    return { valid: true };
};

// Calculate financial summary
const calculateSummary = (trips) => {
    return trips.reduce((acc, trip) => {
        acc.totalRevenue += parseFloat(trip.freight_charge || 0);
        acc.totalExpenses += parseFloat(trip.total_expenses || 0);
        acc.totalDistance += (trip.end_meter_reading - trip.start_meter_reading);
        return acc;
    }, { totalRevenue: 0, totalExpenses: 0, totalDistance: 0, netProfit: 0 });
};

module.exports = {
    generateUsername,
    validateMeterReading,
    calculateSummary
};