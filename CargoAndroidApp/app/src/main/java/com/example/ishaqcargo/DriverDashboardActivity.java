package com.example.ishaqcargo;

import android.content.Intent;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.View;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.widget.NestedScrollView;

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
    private String currentCarNumber;
    private String currentDriverName;
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
        binding.driverAccount.setOnClickListener(v -> {
            // TODO: Navigate to Driver Account
        });
        binding.helperAccount.setOnClickListener(v -> {
            // TODO: Navigate to Helper Account
        });
        binding.leaveToHomeCard.setOnClickListener(v -> {
            // TODO: Navigate to Leave To Home
        });
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

        // FIX: Prevent SwipeRefresh from stealing scroll events
        binding.dashboardSwipeRefresh.setDistanceToTriggerSync(400);

        // FIX: Only enable SwipeRefresh when scrolled to top
        binding.scrollContainer.setOnScrollChangeListener(new NestedScrollView.OnScrollChangeListener() {
            @Override
            public void onScrollChange(NestedScrollView v, int scrollX, int scrollY, int oldScrollX, int oldScrollY) {
                binding.dashboardSwipeRefresh.setEnabled(scrollY == 0);
            }
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
                    
                    // FIXED: Use optDouble directly — backend now sends 0 instead of null
                    currentVehicleAverage = profile != null ? profile.optDouble("overall_average_km_per_liter", 0) : 0;
                    
                    runOnUiThread(() -> {
                        maybeForceEndTrip(ongoingTrip);
                        bindDashboard(lifetime, todayStats, profile);
                        binding.dashboardSwipeRefresh.setRefreshing(false);
                        binding.avgTextView.setText(formatAverage(currentVehicleAverage));
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
        Intent intent;
        if (hasPendingLoadDetails(ongoingTripJson)) {
            intent = new Intent(this, LoadDetailsActivity.class);
            intent.putExtra(LoadDetailsActivity.EXTRA_LOAD_WEIGHT, ongoingTripJson.optString("load_weight", ""));
        } else {
            intent = new Intent(this, EndTripActivity.class);
            intent.putExtra(EndTripActivity.EXTRA_START_METER, ongoingTripJson.optDouble("start_meter_reading", 0));
            intent.putExtra(EndTripActivity.EXTRA_DESTINATION, ongoingTripJson.optString("to_location", "-"));
        }

        intent.putExtra(EndTripActivity.EXTRA_TRIP_ID, tripId);
        intent.putExtra(
                EndTripActivity.EXTRA_ROUTE,
                getString(
                        R.string.trip_route_format,
                        ongoingTripJson.optString("from_location", "-"),
                        ongoingTripJson.optString("to_location", "-")
                )
        );
        intent.putExtra(EndTripActivity.EXTRA_LOCKED_MODE, true);
        startActivity(intent);
        finish();
    }

    private boolean hasPendingLoadDetails(JSONObject ongoingTripJson) {
        String loadPhoto = ongoingTripJson.optString("load_photo", "");
        String loadLocation = ongoingTripJson.optString("load_live_location", "");
        String loadCoordinates = ongoingTripJson.optString("load_coordinates", "");

        if ("null".equalsIgnoreCase(loadPhoto)) loadPhoto = "";
        if ("null".equalsIgnoreCase(loadLocation)) loadLocation = "";
        if ("null".equalsIgnoreCase(loadCoordinates)) loadCoordinates = "";

        return TextUtils.isEmpty(loadPhoto) || TextUtils.isEmpty(loadLocation) || TextUtils.isEmpty(loadCoordinates);
    }

    private void bindDashboard(
            JSONObject lifetime,
            JSONObject todayStats,
            JSONObject profile
    ) {
        int totalTrips = lifetime != null ? lifetime.optInt("total_trips", 0) : 0;
        currentCarNumber = profile != null ? profile.optString("car_number", "") : "";
        currentDriverName = profile != null ? profile.optString("username", "") : "";

        binding.totalTripsValue.setText(String.valueOf(totalTrips));
        binding.carNumberText.setText(getString(
                R.string.car_number_value,
                TextUtils.isEmpty(currentCarNumber) ? "-" : currentCarNumber
        ));
        binding.currentDriverName.setText(currentDriverName);

        // Moboil countdown widget
        JSONObject moboilStatus = profile != null ? profile.optJSONObject("moboil_status") : null;
        if (moboilStatus != null) {
            double remainingKm = moboilStatus.optDouble("remaining_km", 0);
            boolean needsChange = moboilStatus.optBoolean("needs_change", false);
            
            if (needsChange) {
                binding.moboilAlertValueWidget.setText(formatPlainNumber(remainingKm) + " km");
                binding.moboilAlertValueWidget.setTextColor(getColor(R.color.red));
            } else {
                binding.moboilAlertValueWidget.setText(formatPlainNumber(remainingKm) + " km");
                binding.moboilAlertValueWidget.setTextColor(getColor(R.color.km_widget_text));
            }
        } else {
            binding.moboilAlertValueWidget.setText("-- km");
        }
    }

    private void setLoading(boolean loading) {
        binding.dashboardLoadingOverlay.setVisibility(loading ? View.VISIBLE : View.GONE);
        binding.tripHistoryCard.setEnabled(!loading);
        binding.dailyExpenseCard.setEnabled(!loading);
        binding.paymentCard.setEnabled(!loading);
        // REMOVED: binding.dashboardSwipeRefresh.setEnabled(!loading);
        // The scroll listener now controls SwipeRefresh enable state
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

    // FIXED: Only show "--" for NaN/invalid, not for zero. Backend sends 0 when no data.
    private String formatAverage(double average) {
        if (Double.isNaN(average)) {
            return "--";
        }
return "avg " + String.format(Locale.US, "%.3f", average);    }
}