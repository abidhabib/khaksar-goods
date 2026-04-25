package com.example.ishaqcargo;

import android.content.Intent;
import android.content.res.ColorStateList;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.View;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.example.ishaqcargo.databinding.ActivityDriverDashboardBinding;
import com.example.ishaqcargo.network.ApiClient;
import com.example.ishaqcargo.util.SessionManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.util.Locale;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;

public class DriverDashboardActivity extends AppCompatActivity {

    private ActivityDriverDashboardBinding binding;
    private SessionManager sessionManager;
    private JSONObject ongoingTrip;
    private String baseUrl;
    private boolean redirectingToEndTrip;
    private double currentCarMeterReading;

    private final ActivityResultLauncher<Intent> startTripLauncher = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            result -> {
                if (result.getResultCode() == RESULT_OK) {
                    fetchDashboard();
                }
            }
    );

    private final ActivityResultLauncher<Intent> endTripLauncher = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            result -> {
                if (result.getResultCode() == RESULT_OK) {
                    fetchDashboard();
                }
            }
    );

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        binding = ActivityDriverDashboardBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());
        WindowCompat.getInsetsController(getWindow(), binding.getRoot()).setAppearanceLightStatusBars(true);

        sessionManager = new SessionManager(this);
        baseUrl = sessionManager.getBaseUrl();

        applyWindowInsets();
        binding.welcomeText.setText(getString(R.string.dashboard_welcome, sessionManager.getUsername()));

        binding.logoutButton.setOnClickListener(v -> {
            sessionManager.clearSession();
            startActivity(new Intent(this, LoginActivity.class));
            finish();
        });

        binding.startTripButton.setOnClickListener(v -> openStartTripScreen());
        binding.endTripButton.setOnClickListener(v -> openEndTripScreen());
        binding.tripHistoryCard.setOnClickListener(v ->
                startActivity(new Intent(this, TripHistoryActivity.class))
        );
        binding.dailyExpenseCard.setOnClickListener(v ->
                startActivity(new Intent(this, DailyExpensesActivity.class))
        );
        binding.dashboardSwipeRefresh.setOnRefreshListener(this::fetchDashboard);

        fetchDashboard();
    }

    @Override
    protected void onResume() {
        super.onResume();
        redirectingToEndTrip = false;
    }

    private void applyWindowInsets() {
        final int containerLeftPadding = binding.scrollContainer.getPaddingLeft();
        final int containerTopPadding = binding.scrollContainer.getPaddingTop();
        final int containerRightPadding = binding.scrollContainer.getPaddingRight();
        final int scrollBottomPadding = binding.scrollContainer.getPaddingBottom();
        ViewCompat.setOnApplyWindowInsetsListener(binding.getRoot(), (view, windowInsets) -> {
            Insets insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            binding.scrollContainer.setPadding(
                    containerLeftPadding,
                    containerTopPadding + insets.top + 20,
                    containerRightPadding,
                    scrollBottomPadding + insets.bottom + getResources().getDimensionPixelSize(R.dimen.dashboard_bottom_padding)
            );
            return windowInsets;
        });
    }

    private void openStartTripScreen() {
        if (ongoingTrip != null && ongoingTrip.length() > 0) {
            Toast.makeText(this, "End current trip first", Toast.LENGTH_SHORT).show();
            return;
        }

        Intent intent = new Intent(this, StartTripActivity.class);
        intent.putExtra(StartTripActivity.EXTRA_INITIAL_METER, currentCarMeterReading);
        startTripLauncher.launch(intent);
    }

    private void fetchDashboard() {
        String token = sessionManager.getToken();
        if (token == null) {
            return;
        }

        setLoading(true);

        ApiClient.getDriverDashboard(baseUrl, token, new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                runOnUiThread(() -> {
                    binding.dashboardSwipeRefresh.setRefreshing(false);
                    setLoading(false);
                    Toast.makeText(DriverDashboardActivity.this, "Failed to load dashboard", Toast.LENGTH_LONG).show();
                });
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String body = response.body() != null ? response.body().string() : "";

                if (!response.isSuccessful()) {
                    String message = ApiClient.parseErrorMessage(body, "Unable to load dashboard");
                    runOnUiThread(() -> {
                        binding.dashboardSwipeRefresh.setRefreshing(false);
                        setLoading(false);
                        Toast.makeText(DriverDashboardActivity.this, message, Toast.LENGTH_LONG).show();
                    });
                    return;
                }

                try {
                    JSONObject root = new JSONObject(body);
                    JSONObject lifetime = root.optJSONObject("lifetimeStats");
                    JSONObject todayStats = root.optJSONObject("todayStats");
                    JSONArray recentTrips = root.optJSONArray("recentTrips");
                    JSONObject profile = root.optJSONObject("profile");
                    ongoingTrip = root.optJSONObject("ongoingTrip");
                    currentCarMeterReading = profile != null ? profile.optDouble("current_meter_reading", 0) : 0;

                    runOnUiThread(() -> {
                        maybeForceEndTrip(ongoingTrip);
                        bindDashboard(lifetime, todayStats, recentTrips, ongoingTrip);
                        binding.dashboardSwipeRefresh.setRefreshing(false);
                        setLoading(false);
                    });
                } catch (Exception e) {
                    runOnUiThread(() -> {
                        binding.dashboardSwipeRefresh.setRefreshing(false);
                        setLoading(false);
                        Toast.makeText(DriverDashboardActivity.this, "Invalid dashboard response", Toast.LENGTH_LONG).show();
                    });
                }
            }
        });
    }

    private void maybeForceEndTrip(JSONObject ongoingTripJson) {
        if (redirectingToEndTrip || ongoingTripJson == null || ongoingTripJson.length() == 0) {
            return;
        }

        String tripId = ongoingTripJson.optString("id", "");
        if (TextUtils.isEmpty(tripId)) {
            return;
        }

        redirectingToEndTrip = true;
        Intent intent = new Intent(this, EndTripActivity.class);
        intent.putExtra(EndTripActivity.EXTRA_TRIP_ID, tripId);
        intent.putExtra(
                EndTripActivity.EXTRA_ROUTE,
                getString(
                        R.string.trip_route_format,
                        ongoingTripJson.optString("from_location", "-"),
                        ongoingTripJson.optString("to_location", "-")
                )
        );
        intent.putExtra(EndTripActivity.EXTRA_START_METER, ongoingTripJson.optDouble("start_meter_reading", 0));
        intent.putExtra(EndTripActivity.EXTRA_DESTINATION, ongoingTripJson.optString("to_location", "-"));
        intent.putExtra(EndTripActivity.EXTRA_LOCKED_MODE, true);
        startActivity(intent);
        finish();
    }

    private void bindDashboard(
            JSONObject lifetime,
            JSONObject todayStats,
            JSONArray recentTrips,
            JSONObject ongoingTripJson
    ) {
        int totalTrips = lifetime != null ? lifetime.optInt("total_trips", 0) : 0;
        double totalDistance = lifetime != null ? lifetime.optDouble("total_distance", 0) : 0;
        double totalExpenses = lifetime != null ? lifetime.optDouble("total_expenses", 0) : 0;
        double todayRevenue = todayStats != null ? todayStats.optDouble("revenue_today", 0) : 0;

        binding.totalTripsValue.setText(String.valueOf(totalTrips));
        binding.totalKmValue.setText(formatKm(totalDistance));
        binding.totalExpensesValue.setText(formatCurrency(totalExpenses));
        binding.todayRevenueValue.setText(formatCurrency(todayRevenue));

        if (recentTrips != null && recentTrips.length() > 0) {
            JSONObject lastTrip = recentTrips.optJSONObject(0);
            if (lastTrip != null) {
                String from = lastTrip.optString("from_location", "-");
                String to = lastTrip.optString("to_location", "-");
                double expense = lastTrip.optDouble("total_expenses", 0);
                double distance = lastTrip.optDouble("distance_km",
                        lastTrip.optDouble("end_meter_reading", 0) - lastTrip.optDouble("start_meter_reading", 0));

                binding.lastTripRouteValue.setText(getString(R.string.trip_route_format, from, to));
                binding.lastTripMetaValue.setText(
                        getString(R.string.last_trip_meta, formatKm(distance), formatCurrency(expense))
                );
            } else {
                binding.lastTripRouteValue.setText(R.string.no_completed_trips);
                binding.lastTripMetaValue.setText(R.string.last_trip_empty_meta);
            }
        } else {
            binding.lastTripRouteValue.setText(R.string.no_completed_trips);
            binding.lastTripMetaValue.setText(R.string.last_trip_empty_meta);
        }

        if (ongoingTripJson != null && ongoingTripJson.length() > 0) {
            String from = ongoingTripJson.optString("from_location", "-");
            String to = ongoingTripJson.optString("to_location", "-");
            String freight = formatCurrency(ongoingTripJson.optDouble("freight_charge", 0));
            binding.currentTripCard.setCardBackgroundColor(ContextCompat.getColor(this, R.color.current_trip_bg));
            binding.currentTripStatusValue.setText(R.string.trip_status_ongoing);
            binding.currentTripStatusValue.setTextColor(ContextCompat.getColor(this, R.color.trip_active_text));
            binding.currentTripRouteValue.setText(getString(R.string.trip_route_format, from, to));
            binding.currentTripMetaValue.setText(getString(R.string.current_trip_meta, freight));
            binding.currentTripRouteValue.setVisibility(View.VISIBLE);
            binding.endTripButton.setEnabled(true);
            binding.endTripButton.setBackgroundTintList(ColorStateList.valueOf(
                    ContextCompat.getColor(this, R.color.button_emerald_active)
            ));
            binding.endTripButton.setTextColor(ContextCompat.getColor(this, R.color.white));
            binding.startTripButton.setEnabled(false);
            binding.startTripButton.setBackgroundTintList(ColorStateList.valueOf(
                    ContextCompat.getColor(this, R.color.button_amber)
            ));
            binding.startTripButton.setTextColor(ContextCompat.getColor(this, R.color.white));
        } else {
            binding.currentTripCard.setCardBackgroundColor(ContextCompat.getColor(this, R.color.current_trip_bg));
            binding.currentTripStatusValue.setText(R.string.no_ongoing_trip);
            binding.currentTripStatusValue.setTextColor(ContextCompat.getColor(this, R.color.trip_idle_text));
            binding.currentTripRouteValue.setText("-");
            binding.currentTripRouteValue.setVisibility(View.GONE);
            binding.currentTripMetaValue.setText(R.string.current_trip_empty_meta);
            binding.endTripButton.setEnabled(false);
            binding.endTripButton.setBackgroundTintList(ColorStateList.valueOf(
                    ContextCompat.getColor(this, R.color.button_secondary_bg)
            ));
            binding.endTripButton.setTextColor(ContextCompat.getColor(this, R.color.button_secondary_text));
            binding.startTripButton.setEnabled(true);
            binding.startTripButton.setBackgroundTintList(ColorStateList.valueOf(
                    ContextCompat.getColor(this, R.color.button_primary)
            ));
            binding.startTripButton.setTextColor(ContextCompat.getColor(this, R.color.white));
        }
    }

    private void openEndTripScreen() {
        if (ongoingTrip == null || ongoingTrip.length() == 0) {
            Toast.makeText(this, "No ongoing trip", Toast.LENGTH_SHORT).show();
            return;
        }

        String tripId = ongoingTrip.optString("id", "");
        if (TextUtils.isEmpty(tripId)) {
            Toast.makeText(this, "Ongoing trip id missing", Toast.LENGTH_LONG).show();
            return;
        }

        Intent intent = new Intent(this, EndTripActivity.class);
        intent.putExtra(EndTripActivity.EXTRA_TRIP_ID, tripId);
        intent.putExtra(
                EndTripActivity.EXTRA_ROUTE,
                getString(
                        R.string.trip_route_format,
                        ongoingTrip.optString("from_location", "-"),
                        ongoingTrip.optString("to_location", "-")
                )
        );
        intent.putExtra(EndTripActivity.EXTRA_START_METER, ongoingTrip.optDouble("start_meter_reading", 0));
        intent.putExtra(EndTripActivity.EXTRA_DESTINATION, ongoingTrip.optString("to_location", "-"));
        intent.putExtra(EndTripActivity.EXTRA_LOCKED_MODE, true);
        endTripLauncher.launch(intent);
    }

    private void setLoading(boolean loading) {
        binding.dashboardLoadingOverlay.setVisibility(loading ? View.VISIBLE : View.GONE);
        binding.tripHistoryCard.setEnabled(!loading);
        binding.dailyExpenseCard.setEnabled(!loading);
        binding.dashboardSwipeRefresh.setEnabled(!loading);
        binding.startTripButton.setEnabled(!loading && (ongoingTrip == null || ongoingTrip.length() == 0));
        binding.endTripButton.setEnabled(!loading && ongoingTrip != null && ongoingTrip.length() > 0);
    }

    private String formatCurrency(double amount) {
        return String.format(Locale.US, "Rs %.0f", amount);
    }

    private String formatKm(double distance) {
        return String.format(Locale.US, "%.0f km", distance);
    }
}
