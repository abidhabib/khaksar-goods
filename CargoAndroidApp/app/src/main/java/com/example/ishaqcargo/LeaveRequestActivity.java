package com.example.ishaqcargo;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Address;
import android.location.Geocoder;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.View;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.example.ishaqcargo.databinding.ActivityLeaveRequestBinding;
import com.example.ishaqcargo.network.ApiClient;
import com.example.ishaqcargo.util.SessionManager;

import org.json.JSONObject;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;

public class LeaveRequestActivity extends AppCompatActivity {

    private ActivityLeaveRequestBinding binding;
    private SessionManager sessionManager;
    private String baseUrl;
    private String currentMode = "leave";
    private String fetchedLocation;
    private String fetchedCoordinates;

    private final ActivityResultLauncher<String[]> locationPermissionLauncher = registerForActivityResult(
            new ActivityResultContracts.RequestMultiplePermissions(),
            result -> {
                boolean granted = Boolean.TRUE.equals(result.get(Manifest.permission.ACCESS_FINE_LOCATION))
                        || Boolean.TRUE.equals(result.get(Manifest.permission.ACCESS_COARSE_LOCATION));
                if (granted) {
                    fetchCurrentLocation();
                } else {
                    Toast.makeText(this, R.string.location_permission_required, Toast.LENGTH_SHORT).show();
                }
            }
    );

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        binding = ActivityLeaveRequestBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());
        WindowCompat.getInsetsController(getWindow(), binding.getRoot()).setAppearanceLightStatusBars(true);

        sessionManager = new SessionManager(this);
        baseUrl = sessionManager.getBaseUrl();

        applyWindowInsets();
        binding.backButton.setOnClickListener(v -> finish());
        binding.fetchLocationButton.setOnClickListener(v -> ensureLocationPermissionAndFetch());
        binding.confirmButton.setOnClickListener(v -> submitCurrentAction());

        loadLeaveStatus();
        ensureLocationPermissionAndFetch();
    }

    private void applyWindowInsets() {
        final int topBarTopPadding = binding.topBar.getPaddingTop();
        final int contentBottomPadding = binding.contentScroll.getPaddingBottom();
        ViewCompat.setOnApplyWindowInsetsListener(binding.getRoot(), (view, windowInsets) -> {
            Insets insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            binding.topBar.setPadding(
                    binding.topBar.getPaddingLeft(),
                    topBarTopPadding + insets.top,
                    binding.topBar.getPaddingRight(),
                    binding.topBar.getPaddingBottom()
            );
            binding.contentScroll.setPadding(
                    binding.contentScroll.getPaddingLeft(),
                    binding.contentScroll.getPaddingTop(),
                    binding.contentScroll.getPaddingRight(),
                    contentBottomPadding + insets.bottom + getResources().getDimensionPixelSize(R.dimen.dashboard_bottom_padding)
            );
            return windowInsets;
        });
    }

    private void loadLeaveStatus() {
        setLoading(true);
        ApiClient.getLeaveStatus(baseUrl, sessionManager.getToken(), new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                runOnUiThread(() -> {
                    setLoading(false);
                    Toast.makeText(LeaveRequestActivity.this, R.string.unable_to_load_daily_expenses, Toast.LENGTH_LONG).show();
                });
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String body = response.body() != null ? response.body().string() : "";
                if (!response.isSuccessful()) {
                    String message = ApiClient.parseErrorMessage(body, getString(R.string.unable_to_load_daily_expenses));
                    runOnUiThread(() -> {
                        setLoading(false);
                        Toast.makeText(LeaveRequestActivity.this, message, Toast.LENGTH_LONG).show();
                    });
                    return;
                }

                try {
                    JSONObject root = new JSONObject(body);
                    JSONObject leaveStatus = root.optJSONObject("leaveStatus");
                    JSONObject leaveSummary = root.optJSONObject("leaveSummary");
                    runOnUiThread(() -> {
                        bindLeaveStatus(leaveStatus, leaveSummary);
                        setLoading(false);
                    });
                } catch (Exception e) {
                    runOnUiThread(() -> setLoading(false));
                }
            }
        });
    }

    private void bindLeaveStatus(JSONObject leaveStatus, JSONObject leaveSummary) {
        int totalDays = leaveSummary != null ? leaveSummary.optInt("total_leave_days", 0) : 0;
        binding.totalLeaveDaysText.setText(totalDays + " days");

        String status = leaveStatus != null ? leaveStatus.optString("status", "") : "";
        if ("on_leave".equals(status)) {
            currentMode = "join";
            binding.statusText.setText(R.string.leave_status_on_leave);
            binding.confirmButton.setText(R.string.leave_confirm_join);
            binding.confirmButton.setEnabled(true);
            binding.meterReadingInput.setEnabled(true);
            binding.fetchLocationButton.setEnabled(true);
            binding.locationInput.setEnabled(true);
        } else if ("pending_join".equals(status)) {
            currentMode = "pending_join";
            binding.statusText.setText(R.string.leave_status_pending_join);
            binding.confirmButton.setText(R.string.leave_confirm_join);
            binding.confirmButton.setEnabled(false);
            binding.meterReadingInput.setEnabled(false);
            binding.fetchLocationButton.setEnabled(false);
            binding.locationInput.setEnabled(false);
        } else {
            currentMode = "leave";
            binding.statusText.setText(R.string.leave_status_ready);
            binding.confirmButton.setText(R.string.leave_confirm_go);
            binding.confirmButton.setEnabled(true);
            binding.meterReadingInput.setEnabled(true);
            binding.fetchLocationButton.setEnabled(true);
            binding.locationInput.setEnabled(true);
        }
    }

    private void ensureLocationPermissionAndFetch() {
        boolean fineGranted = ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean coarseGranted = ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;

        if (fineGranted || coarseGranted) {
            fetchCurrentLocation();
            return;
        }

        locationPermissionLauncher.launch(new String[]{
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
        });
    }

    private void fetchCurrentLocation() {
        LocationManager locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
        if (locationManager == null) {
            Toast.makeText(this, R.string.location_unavailable, Toast.LENGTH_SHORT).show();
            return;
        }

        String provider = locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)
                ? LocationManager.GPS_PROVIDER
                : locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
                ? LocationManager.NETWORK_PROVIDER
                : null;

        if (provider == null) {
            Toast.makeText(this, R.string.enable_location_services, Toast.LENGTH_SHORT).show();
            return;
        }

        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
                && ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            locationManager.getCurrentLocation(provider, null, getMainExecutor(), this::handleLocationResult);
        } else {
            locationManager.requestSingleUpdate(provider, new LocationListener() {
                @Override
                public void onLocationChanged(Location location) {
                    handleLocationResult(location);
                }
            }, null);
        }
    }

    private void handleLocationResult(Location location) {
        if (location == null) {
            Toast.makeText(this, R.string.location_unavailable, Toast.LENGTH_SHORT).show();
            return;
        }

        fetchedCoordinates = formatCoordinates(location);
        fetchedLocation = buildLocationLabel(location);
        binding.locationInput.setText(fetchedLocation);
        binding.coordinatesText.setText(fetchedCoordinates);
        Toast.makeText(this, R.string.location_fetched_success, Toast.LENGTH_SHORT).show();
    }

    private String buildLocationLabel(Location location) {
        try {
            Geocoder geocoder = new Geocoder(this, Locale.getDefault());
            List<Address> addresses = geocoder.getFromLocation(location.getLatitude(), location.getLongitude(), 1);
            if (addresses != null && !addresses.isEmpty()) {
                Address address = addresses.get(0);
                String label = joinLocationParts(
                        address.getSubLocality(),
                        address.getLocality(),
                        address.getAdminArea(),
                        address.getCountryName()
                );
                if (!TextUtils.isEmpty(label)) {
                    return label;
                }
            }
        } catch (IOException ignored) {
        }
        return fetchedCoordinates != null ? fetchedCoordinates : "";
    }

    private String formatCoordinates(Location location) {
        return String.format(Locale.US, "%.6f,%.6f", location.getLatitude(), location.getLongitude());
    }

    private String joinLocationParts(String... values) {
        StringBuilder builder = new StringBuilder();
        for (String value : values) {
            if (TextUtils.isEmpty(value)) {
                continue;
            }

            String trimmed = value.trim();
            if (trimmed.isEmpty()) {
                continue;
            }

            String current = builder.toString();
            if (current.contains(trimmed)) {
                continue;
            }

            if (builder.length() > 0) {
                builder.append(", ");
            }
            builder.append(trimmed);
        }
        return builder.toString();
    }

    private void submitCurrentAction() {
        String meterReading = getInput(binding.meterReadingInput);
        if (TextUtils.isEmpty(meterReading)) {
            binding.meterReadingInput.setError(getString(R.string.leave_meter_required));
            return;
        }

        if (TextUtils.isEmpty(fetchedLocation)) {
            Toast.makeText(this, R.string.leave_location_required, Toast.LENGTH_SHORT).show();
            return;
        }

        Map<String, String> fields = new LinkedHashMap<>();
        Callback callback = new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                runOnUiThread(() -> {
                    setLoading(false);
                    Toast.makeText(LeaveRequestActivity.this, R.string.unable_to_save_expense, Toast.LENGTH_LONG).show();
                });
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String body = response.body() != null ? response.body().string() : "";
                if (!response.isSuccessful()) {
                    String message = ApiClient.parseErrorMessage(body, getString(R.string.unable_to_save_expense));
                    runOnUiThread(() -> {
                        setLoading(false);
                        Toast.makeText(LeaveRequestActivity.this, message, Toast.LENGTH_LONG).show();
                    });
                    return;
                }

                runOnUiThread(() -> {
                    setLoading(false);
                    Toast.makeText(
                            LeaveRequestActivity.this,
                            "join".equals(currentMode) ? R.string.leave_join_requested_successfully : R.string.leave_started_successfully,
                            Toast.LENGTH_SHORT
                    ).show();
                    Intent intent = new Intent(LeaveRequestActivity.this, DriverDashboardActivity.class);
                    intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                    startActivity(intent);
                    finish();
                });
            }
        };

        setLoading(true);
        if ("join".equals(currentMode)) {
            fields.put("join_meter_reading", meterReading);
            fields.put("join_location", fetchedLocation);
            fields.put("join_coordinates", fetchedCoordinates != null ? fetchedCoordinates : "");
            ApiClient.requestJoinAfterLeave(baseUrl, sessionManager.getToken(), fields, callback);
        } else if ("leave".equals(currentMode)) {
            fields.put("leave_meter_reading", meterReading);
            fields.put("leave_location", fetchedLocation);
            fields.put("leave_coordinates", fetchedCoordinates != null ? fetchedCoordinates : "");
            ApiClient.requestLeave(baseUrl, sessionManager.getToken(), fields, callback);
        }
    }

    private void setLoading(boolean loading) {
        binding.loadingOverlay.setVisibility(loading ? View.VISIBLE : View.GONE);
        binding.confirmButton.setEnabled(!loading && !"pending_join".equals(currentMode));
        binding.fetchLocationButton.setEnabled(!loading);
    }

    private String getInput(com.google.android.material.textfield.TextInputEditText input) {
        return input.getText() != null ? input.getText().toString().trim() : "";
    }
}
