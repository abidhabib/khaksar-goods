package com.example.ishaqcargo;

import android.content.Intent;
import android.os.Bundle;
import android.text.TextUtils;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.example.ishaqcargo.databinding.ActivityDriverDashboardBinding;
import com.example.ishaqcargo.network.ApiClient;
import com.example.ishaqcargo.util.SessionManager;

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
    private String currentLicenseNumber;
    private double currentVehicleAverage;

    private final ActivityResultLauncher<Intent> startTripLauncher = registerForActivityResult(
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
        binding.welcomeText.setText(getString(R.string.license_number_value, "-"));

        binding.logoutButton.setOnClickListener(v -> {
            sessionManager.clearSession();
            startActivity(new Intent(this, LoginActivity.class));
            finish();
        });

        binding.startTripButton.setOnClickListener(v -> openStartTripScreen());
        binding.tripHistoryCard.setOnClickListener(v ->
                startActivity(new Intent(this, TripHistoryActivity.class))
        );
        binding.dailyExpenseCard.setOnClickListener(v ->
                startActivity(new Intent(this, DailyExpensesActivity.class))
        );
        binding.paymentCard.setOnClickListener(v ->
                startActivity(new Intent(this, PaymentSubmissionActivity.class))
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
                    JSONObject profile = root.optJSONObject("profile");
                    ongoingTrip = root.optJSONObject("ongoingTrip");
                    currentCarMeterReading = profile != null ? profile.optDouble("current_meter_reading", 0) : 0;
                    currentVehicleAverage = profile != null ? profile.optDouble("overall_average_km_per_liter", 0) : 0;

                    runOnUiThread(() -> {
                        maybeForceEndTrip(ongoingTrip);
                        bindDashboard(lifetime, todayStats, profile);
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
            JSONObject profile
    ) {
        int totalTrips = lifetime != null ? lifetime.optInt("total_trips", 0) : 0;
        double totalDistance = lifetime != null ? lifetime.optDouble("total_distance", 0) : 0;
        double totalExpenses = lifetime != null ? lifetime.optDouble("total_expenses", 0) : 0;
        double todayRevenue = todayStats != null ? todayStats.optDouble("revenue_today", 0) : 0;
        currentLicenseNumber = profile != null ? profile.optString("license_number", "") : "";

        binding.totalTripsValue.setText(String.valueOf(totalTrips));
        binding.totalKmValue.setText(formatKm(totalDistance));
        binding.totalExpensesValue.setText(formatCurrency(totalExpenses));
        binding.todayRevenueValue.setText(formatCurrency(todayRevenue));
        binding.welcomeText.setText(getString(
                R.string.license_number_value,
                TextUtils.isEmpty(currentLicenseNumber) ? "-" : currentLicenseNumber
        ));
        binding.headerSubtitleText.setText(getString(
                R.string.dashboard_average_value,
                formatAverage(currentVehicleAverage)
        ));

        JSONObject lastMoboilChange = profile != null ? profile.optJSONObject("last_moboil_change") : null;
        if (lastMoboilChange != null && !lastMoboilChange.isNull("meter_reading")) {
            binding.moboilAlertValue.setText(getString(
                    R.string.moboil_alert_value,
                    formatPlainNumber(lastMoboilChange.optDouble("meter_reading", 0)),
                    formatPlainNumber(lastMoboilChange.optDouble("km_since_change", 0))
            ));
        } else {
            binding.moboilAlertValue.setText(R.string.moboil_alert_empty);
        }
    }

    private void setLoading(boolean loading) {
        binding.dashboardLoadingOverlay.setVisibility(loading ? android.view.View.VISIBLE : android.view.View.GONE);
        binding.tripHistoryCard.setEnabled(!loading);
        binding.dailyExpenseCard.setEnabled(!loading);
        binding.paymentCard.setEnabled(!loading);
        binding.dashboardSwipeRefresh.setEnabled(!loading);
        binding.startTripButton.setEnabled(!loading && (ongoingTrip == null || ongoingTrip.length() == 0));
    }

    private String formatCurrency(double amount) {
        return formatPlainNumber(amount);
    }

    private String formatKm(double distance) {
        return formatPlainNumber(distance);
    }

    private String formatPlainNumber(double value) {
        return String.format(Locale.US, "%.0f", value);
    }

    private String formatAverage(double average) {
        if (!(average > 0)) {
            return "N/A";
        }
        return String.format(Locale.US, "%.2f km/L", average);
    }
}
