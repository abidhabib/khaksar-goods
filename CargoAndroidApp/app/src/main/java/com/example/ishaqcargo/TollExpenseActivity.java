package com.example.ishaqcargo;

import android.Manifest;
import android.content.pm.PackageManager;
import android.location.Address;
import android.location.Geocoder;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Looper;
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

import com.example.ishaqcargo.databinding.ActivityTollExpenseBinding;
import com.example.ishaqcargo.network.ApiClient;
import com.example.ishaqcargo.util.SessionManager;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;

public class TollExpenseActivity extends AppCompatActivity {

    private static final String STATE_LOCATION_LABEL = "state_location_label";
    private static final String STATE_LOCATION_COORDS = "state_location_coords";

    private ActivityTollExpenseBinding binding;
    private SessionManager sessionManager;
    private String baseUrl;
    private String tripId;
    private String fetchedLocationLabel;
    private String fetchedLocationCoordinates;
    private Runnable locationTimeoutRunnable;

    private final ActivityResultLauncher<String[]> locationPermissionLauncher = registerForActivityResult(
            new ActivityResultContracts.RequestMultiplePermissions(),
            result -> {
                boolean granted = Boolean.TRUE.equals(result.get(Manifest.permission.ACCESS_FINE_LOCATION))
                        || Boolean.TRUE.equals(result.get(Manifest.permission.ACCESS_COARSE_LOCATION));

                if (granted) {
                    fetchCurrentLocation();
                }
            }
    );

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        binding = ActivityTollExpenseBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());
        WindowCompat.getInsetsController(getWindow(), binding.getRoot()).setAppearanceLightStatusBars(true);

        sessionManager = new SessionManager(this);
        baseUrl = sessionManager.getBaseUrl();
        tripId = getIntent().getStringExtra(EndTripActivity.EXTRA_TRIP_ID);

        applyWindowInsets();
        restoreTransientState(savedInstanceState);

        binding.backButton.setOnClickListener(v -> finish());
        binding.saveButton.setOnClickListener(v -> saveExpense());
        ensureLocationPermissionAndFetch();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        outState.putString(STATE_LOCATION_LABEL, fetchedLocationLabel);
        outState.putString(STATE_LOCATION_COORDS, fetchedLocationCoordinates);
    }

    private void applyWindowInsets() {
        final int topBarTopPadding = binding.topBar.getPaddingTop();
        final int formBottomPadding = binding.formScroll.getPaddingBottom();
        ViewCompat.setOnApplyWindowInsetsListener(binding.getRoot(), (view, windowInsets) -> {
            Insets insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            binding.topBar.setPadding(
                    binding.topBar.getPaddingLeft(),
                    topBarTopPadding + insets.top,
                    binding.topBar.getPaddingRight(),
                    binding.topBar.getPaddingBottom()
            );
            binding.formScroll.setPadding(
                    binding.formScroll.getPaddingLeft(),
                    binding.formScroll.getPaddingTop(),
                    binding.formScroll.getPaddingRight(),
                    formBottomPadding + insets.bottom + getResources().getDimensionPixelSize(R.dimen.dashboard_bottom_padding)
            );
            return windowInsets;
        });
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
            return;
        }

        String provider = locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)
                ? LocationManager.GPS_PROVIDER
                : locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
                ? LocationManager.NETWORK_PROVIDER
                : null;

        if (provider == null) {
            return;
        }

        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
                && ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        Location cachedLocation = getBestLastKnownLocation(locationManager);
        if (cachedLocation != null) {
            handleLocationResult(cachedLocation);
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            locationManager.getCurrentLocation(provider, null, getMainExecutor(), this::handleLocationResult);
        } else {
            requestSingleLocationUpdate(locationManager, provider);
        }
    }

    private Location getBestLastKnownLocation(LocationManager locationManager) {
        Location bestLocation = null;

        for (String provider : locationManager.getProviders(true)) {
            if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
                    && ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                return null;
            }

            Location candidate = locationManager.getLastKnownLocation(provider);
            if (candidate == null) {
                continue;
            }

            if (bestLocation == null || candidate.getTime() > bestLocation.getTime()) {
                bestLocation = candidate;
            }
        }

        return bestLocation;
    }

    @SuppressWarnings("deprecation")
    private void requestSingleLocationUpdate(LocationManager locationManager, String provider) {
        try {
            LocationListener listener = new LocationListener() {
                @Override
                public void onLocationChanged(Location location) {
                    locationManager.removeUpdates(this);
                    handleLocationResult(location);
                }
            };

            locationManager.requestLocationUpdates(provider, 0L, 0f, listener, Looper.getMainLooper());
            clearLocationTimeout();
            locationTimeoutRunnable = () -> {
                try {
                    locationManager.removeUpdates(listener);
                } catch (Exception ignored) {
                }
            };
            binding.locationInput.postDelayed(locationTimeoutRunnable, 8000L);
        } catch (Exception ignored) {
            clearLocationTimeout();
        }
    }

    private void handleLocationResult(Location location) {
        clearLocationTimeout();
        if (location == null) {
            return;
        }

        fetchedLocationLabel = buildLocationLabel(location);
        fetchedLocationCoordinates = formatCoordinates(location);
        binding.locationInput.setText(fetchedLocationLabel);
        binding.locationInput.setSelection(fetchedLocationLabel.length());
    }

    private void clearLocationTimeout() {
        if (locationTimeoutRunnable != null) {
            binding.locationInput.removeCallbacks(locationTimeoutRunnable);
            locationTimeoutRunnable = null;
        }
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
                        address.getAdminArea()
                );
                if (!TextUtils.isEmpty(label)) {
                    return label;
                }
            }
        } catch (IOException ignored) {
        }

        return String.format(Locale.US, "%.5f, %.5f", location.getLatitude(), location.getLongitude());
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

    private String formatCoordinates(Location location) {
        return String.format(Locale.US, "%.6f,%.6f", location.getLatitude(), location.getLongitude());
    }

    private void saveExpense() {
        String amount = getInput(binding.amountInput);
        if (TextUtils.isEmpty(amount)) {
            binding.amountInput.setError(getString(R.string.enter_expense_amount));
            return;
        }

        String location = getInput(binding.locationInput);
        if (TextUtils.isEmpty(location)) {
            binding.locationInput.setError(getString(R.string.diesel_location_required));
            return;
        }

        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("category", "toll");
        fields.put("amount", amount);
        fields.put("location", location);
        if (!TextUtils.isEmpty(fetchedLocationCoordinates)) {
            fields.put("coordinates", fetchedLocationCoordinates);
        }

        setSubmitting(true);
        ApiClient.addTripExpense(baseUrl, sessionManager.getToken(), tripId, fields, null, null, new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                runOnUiThread(() -> {
                    setSubmitting(false);
                    Toast.makeText(TollExpenseActivity.this, R.string.unable_to_save_expense, Toast.LENGTH_LONG).show();
                });
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String body = response.body() != null ? response.body().string() : "";
                if (!response.isSuccessful()) {
                    String message = ApiClient.parseErrorMessage(body, getString(R.string.unable_to_save_expense));
                    runOnUiThread(() -> {
                        setSubmitting(false);
                        Toast.makeText(TollExpenseActivity.this, message, Toast.LENGTH_LONG).show();
                    });
                    return;
                }

                runOnUiThread(() -> {
                    setSubmitting(false);
                    setResult(RESULT_OK);
                    Toast.makeText(TollExpenseActivity.this, R.string.expense_saved_successfully, Toast.LENGTH_SHORT).show();
                    finish();
                });
            }
        });
    }

    private void setSubmitting(boolean submitting) {
        binding.loadingOverlay.setVisibility(submitting ? View.VISIBLE : View.GONE);
        binding.saveButton.setEnabled(!submitting);
    }

    private String getInput(com.google.android.material.textfield.TextInputEditText input) {
        return input.getText() != null ? input.getText().toString().trim() : "";
    }

    private void restoreTransientState(Bundle savedInstanceState) {
        if (savedInstanceState == null) {
            return;
        }

        fetchedLocationLabel = savedInstanceState.getString(STATE_LOCATION_LABEL);
        fetchedLocationCoordinates = savedInstanceState.getString(STATE_LOCATION_COORDS);

        if (!TextUtils.isEmpty(fetchedLocationLabel)) {
            binding.locationInput.setText(fetchedLocationLabel);
        }
    }
}
