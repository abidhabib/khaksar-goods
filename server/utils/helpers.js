// Generate username from name (for admin to easily create logins)
const generateUsername = (name, phone) => {
    const cleanName = name.toLowerCase().replace(/\s+/g, '');
    const last4Phone = phone.slice(-4);
    return `${cleanName}_${last4Phone}`;
};

const toTimestampMs = (value, fallbackToEndOfDay = false) => {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        const time = value.getTime();
        return Number.isNaN(time) ? null : time;
    }

    const normalized = String(value).trim();
    if (!normalized) {
        return null;
    }

    const sourceValue = fallbackToEndOfDay && /^\d{4}-\d{2}-\d{2}$/.test(normalized)
        ? `${normalized}T23:59:59`
        : normalized;
    const parsed = new Date(sourceValue);
    const time = parsed.getTime();
    return Number.isNaN(time) ? null : time;
};

const attachBetweenTripDailyExpenses = (trips, timelineTrips = [], dailyExpenseEntries = []) => {
    if (!Array.isArray(trips) || !trips.length) {
        return Array.isArray(trips) ? trips : [];
    }

    const tripIds = new Set(trips.map((trip) => Number(trip.id)).filter(Number.isFinite));
    const tripsByDriver = new Map();
    const firstTripByDriverId = new Map();

    for (const timelineTrip of timelineTrips) {
        const tripId = Number(timelineTrip?.id);
        const driverId = Number(timelineTrip?.driver_id);
        if (!Number.isFinite(tripId) || !Number.isFinite(driverId)) {
            continue;
        }

        if (!tripsByDriver.has(driverId)) {
            tripsByDriver.set(driverId, []);
        }

        tripsByDriver.get(driverId).push({
            id: tripId,
            driver_id: driverId,
            status: timelineTrip.status,
            started_at_ms: toTimestampMs(timelineTrip.started_at),
            ended_at_ms: toTimestampMs(timelineTrip.ended_at),
            start_meter_reading: Number(timelineTrip.start_meter_reading),
            end_meter_reading: Number(timelineTrip.end_meter_reading)
        });
    }

    for (const [driverId, driverTrips] of tripsByDriver.entries()) {
        driverTrips.sort((left, right) => {
            const leftStart = left.started_at_ms ?? Number.MIN_SAFE_INTEGER;
            const rightStart = right.started_at_ms ?? Number.MIN_SAFE_INTEGER;
            if (leftStart !== rightStart) {
                return leftStart - rightStart;
            }
            return left.id - right.id;
        });

        const firstTrip = driverTrips.find((trip) => trip.started_at_ms !== null);
        if (firstTrip) {
            firstTripByDriverId.set(driverId, firstTrip);
        }

        const windows = [];
        for (let index = 0; index < driverTrips.length; index += 1) {
            const trip = driverTrips[index];
            if (trip.status !== 'completed' || trip.ended_at_ms === null) {
                continue;
            }

            let nextTripId = null;
            let nextStartedAtMs = null;
            let wastedKm = 0;
            for (let nextIndex = index + 1; nextIndex < driverTrips.length; nextIndex += 1) {
                const nextTrip = driverTrips[nextIndex];
                if (nextTrip.started_at_ms !== null && nextTrip.started_at_ms > trip.ended_at_ms) {
                    nextTripId = nextTrip.id;
                    nextStartedAtMs = nextTrip.started_at_ms;
                    const previousEndMeter = Number(trip.end_meter_reading);
                    const nextStartMeter = Number(nextTrip.start_meter_reading);
                    wastedKm = Number.isFinite(previousEndMeter) && Number.isFinite(nextStartMeter)
                        ? Math.max(0, nextStartMeter - previousEndMeter)
                        : 0;
                    break;
                }
            }

            const window = {
                completed_trip_id: trip.id,
                next_trip_id: nextTripId,
                start_ms: trip.ended_at_ms,
                end_ms: nextStartedAtMs,
                wasted_km: wastedKm
            };
            windows.push(window);

        }

        tripsByDriver.set(driverId, windows);
    }

    const linkedByTripId = new Map();
    const waitingByTripId = new Map();
    const waitingTargetTripIdByTripId = new Map();
    const waitingNextTripWastedKmByTripId = new Map();
    const startingWastedKmByTripId = new Map();

    for (const windows of tripsByDriver.values()) {
        for (const window of windows) {
            if (Number.isFinite(window.next_trip_id) && tripIds.has(window.next_trip_id)) {
                startingWastedKmByTripId.set(window.next_trip_id, Number(window.wasted_km) || 0);
            }
        }
    }

    for (const entry of dailyExpenseEntries) {
        const driverId = Number(entry?.driver_id);
        const amount = Number(entry?.amount) || 0;
        if (!Number.isFinite(driverId) || amount <= 0) {
            continue;
        }

        const entryTimestamp = toTimestampMs(entry.created_at) ?? toTimestampMs(entry.expense_date, true);
        const windows = tripsByDriver.get(driverId) || [];
        const targetWindow = entryTimestamp === null
            ? null
            : windows.find((window) =>
                entryTimestamp >= window.start_ms &&
                (window.end_ms === null || entryTimestamp < window.end_ms)
            );

        if (targetWindow && tripIds.has(targetWindow.completed_trip_id)) {
            if (!waitingByTripId.has(targetWindow.completed_trip_id)) {
                waitingByTripId.set(targetWindow.completed_trip_id, []);
            }

            waitingByTripId.get(targetWindow.completed_trip_id).push({
                ...entry,
                amount
            });

            if (!waitingTargetTripIdByTripId.has(targetWindow.completed_trip_id)) {
                waitingTargetTripIdByTripId.set(
                    targetWindow.completed_trip_id,
                    Number.isFinite(targetWindow.next_trip_id) ? targetWindow.next_trip_id : null
                );
            }

            if (!waitingNextTripWastedKmByTripId.has(targetWindow.completed_trip_id)) {
                waitingNextTripWastedKmByTripId.set(targetWindow.completed_trip_id, Number(targetWindow.wasted_km) || 0);
            }
        }

        const appliedTripId = Number(entry?.applied_trip_id);
        if (Number.isFinite(appliedTripId) && tripIds.has(appliedTripId)) {
            if (!linkedByTripId.has(appliedTripId)) {
                linkedByTripId.set(appliedTripId, []);
            }

            linkedByTripId.get(appliedTripId).push({
                ...entry,
                amount
            });
            continue;
        }

        const firstTrip = firstTripByDriverId.get(driverId);
        if (
            firstTrip &&
            firstTrip.started_at_ms !== null &&
            entryTimestamp !== null &&
            entryTimestamp < firstTrip.started_at_ms &&
            tripIds.has(firstTrip.id)
        ) {
            if (!linkedByTripId.has(firstTrip.id)) {
                linkedByTripId.set(firstTrip.id, []);
            }

            linkedByTripId.get(firstTrip.id).push({
                ...entry,
                amount
            });
            continue;
        }

        if (!targetWindow) {
            continue;
        }

        if (Number.isFinite(targetWindow.next_trip_id)) {
            if (tripIds.has(targetWindow.next_trip_id)) {
                if (!linkedByTripId.has(targetWindow.next_trip_id)) {
                    linkedByTripId.set(targetWindow.next_trip_id, []);
                }

                linkedByTripId.get(targetWindow.next_trip_id).push({
                    ...entry,
                    amount
                });
            }
            continue;
        }
    }

    return trips.map((trip) => {
        const tripId = Number(trip.id);
        const tripExpenses = Array.isArray(trip.expenses) ? trip.expenses : [];
        const dailyExpenses = linkedByTripId.get(tripId) || [];
        const pendingNextTripDailyExpenses = waitingByTripId.get(tripId) || [];
        const baseTotalExpenses = Number(trip.total_expenses) || 0;
        const betweenTripExpensesTotal = dailyExpenses.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
        const pendingNextTripExpensesTotal = pendingNextTripDailyExpenses.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
        const combinedExpensesTotal = baseTotalExpenses + betweenTripExpensesTotal;
        const freightCharge = Number(trip.freight_charge) || 0;

        return {
            ...trip,
            freight_charge: freightCharge,
            trip_expenses_total: baseTotalExpenses,
            between_trip_expenses_total: betweenTripExpensesTotal,
            total_expenses: combinedExpensesTotal,
            net_profit: trip.net_profit !== undefined || trip.net_profit === null
                ? freightCharge - combinedExpensesTotal
                : trip.net_profit,
            net_income: trip.net_income !== undefined || trip.net_income === null
                ? freightCharge - combinedExpensesTotal
                : trip.net_income,
            daily_expenses: dailyExpenses,
            pending_next_trip_daily_expenses: pendingNextTripDailyExpenses,
            pending_next_trip_expenses_total: pendingNextTripExpensesTotal,
            pending_next_trip_target_trip_id: waitingTargetTripIdByTripId.has(tripId)
                ? waitingTargetTripIdByTripId.get(tripId)
                : null,
            pending_next_trip_start_wasted_km: waitingNextTripWastedKmByTripId.has(tripId)
                ? waitingNextTripWastedKmByTripId.get(tripId)
                : 0,
            pending_next_trip_wasted_km: startingWastedKmByTripId.has(tripId)
                ? startingWastedKmByTripId.get(tripId)
                : 0,
            expenses: tripExpenses
        };
    });
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
    calculateSummary,
    attachBetweenTripDailyExpenses
};
