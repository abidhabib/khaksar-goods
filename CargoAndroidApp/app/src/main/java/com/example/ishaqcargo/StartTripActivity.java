package com.example.ishaqcargo;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Address;
import android.location.Geocoder;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Looper;
import android.text.TextUtils;
import android.util.Log;
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

import com.example.ishaqcargo.databinding.ActivityStartTripBinding;
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

public class StartTripActivity extends AppCompatActivity {

    private static final String TAG = "StartTripActivity";

    private ActivityStartTripBinding binding;
    private SessionManager sessionManager;
    private Uri meterImageUri;
    private Uri biltySlipImageUri;
    private String baseUrl;
    private String fetchedStartLocation;
    private Runnable startLocationTimeoutRunnable;

    private final ActivityResultLauncher<String> pickMeterImageLauncher = registerForActivityResult(
            new ActivityResultContracts.GetContent(),
            uri -> {
                if (uri != null) {
                    meterImageUri = uri;
                    binding.startMeterImagePreview.setImageURI(uri);
                    binding.startMeterImagePreview.setVisibility(View.VISIBLE);
                    binding.startUploadHint.setText(R.string.start_trip_change_photo);
                }
            }
    );

    private final ActivityResultLauncher<String> pickBiltyImageLauncher = registerForActivityResult(
            new ActivityResultContracts.GetContent(),
            uri -> {
                if (uri != null) {
                    biltySlipImageUri = uri;
                    binding.biltyImagePreview.setImageURI(uri);
                    binding.biltyImagePreview.setVisibility(View.VISIBLE);
                    binding.biltyUploadHint.setText(R.string.bilty_change_photo);
                }
            }
    );

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
        binding = ActivityStartTripBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());
        WindowCompat.getInsetsController(getWindow(), binding.getRoot()).setAppearanceLightStatusBars(true);

        sessionManager = new SessionManager(this);
        baseUrl = sessionManager.getBaseUrl();

        applyWindowInsets();

        binding.backButton.setOnClickListener(v -> finish());
        binding.startMeterImagePreview.setOnClickListener(v -> pickMeterImageLauncher.launch("image/*"));
        binding.startUploadHint.setOnClickListener(v -> pickMeterImageLauncher.launch("image/*"));
        binding.biltyImagePreview.setOnClickListener(v -> pickBiltyImageLauncher.launch("image/*"));
        binding.biltyUploadHint.setOnClickListener(v -> pickBiltyImageLauncher.launch("image/*"));
        binding.fetchStartLocationButton.setOnClickListener(v -> ensureLocationPermissionAndFetch());
        binding.submitTripButton.setOnClickListener(v -> submitTrip());
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
            Toast.makeText(this, R.string.location_permission_required, Toast.LENGTH_SHORT).show();
            return;
        }

        binding.fetchStartLocationButton.setEnabled(false);

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
            clearStartLocationTimeout();
            startLocationTimeoutRunnable = () -> {
                try {
                    locationManager.removeUpdates(listener);
                } catch (Exception ignored) {
                }
                binding.fetchStartLocationButton.setEnabled(true);
                Toast.makeText(StartTripActivity.this, R.string.location_unavailable, Toast.LENGTH_SHORT).show();
            };
            binding.fetchStartLocationButton.postDelayed(startLocationTimeoutRunnable, 8000L);
        } catch (Exception exception) {
            clearStartLocationTimeout();
            binding.fetchStartLocationButton.setEnabled(true);
            Toast.makeText(this, R.string.location_unavailable, Toast.LENGTH_SHORT).show();
        }
    }

    private void handleLocationResult(Location location) {
        clearStartLocationTimeout();
        binding.fetchStartLocationButton.setEnabled(true);

        if (location == null) {
            Toast.makeText(this, R.string.location_unavailable, Toast.LENGTH_SHORT).show();
            return;
        }

        String resolvedLocation = buildLocationLabel(location);
        fetchedStartLocation = resolvedLocation;
        binding.startFromInput.setText(resolvedLocation);
        binding.startFromInput.setSelection(resolvedLocation.length());
        Toast.makeText(this, R.string.location_fetched_success, Toast.LENGTH_SHORT).show();
    }

    private void clearStartLocationTimeout() {
        if (startLocationTimeoutRunnable != null) {
            binding.fetchStartLocationButton.removeCallbacks(startLocationTimeoutRunnable);
            startLocationTimeoutRunnable = null;
        }
    }

    private String buildLocationLabel(Location location) {
        try {
            Geocoder geocoder = new Geocoder(this, Locale.getDefault());
            List<Address> addresses = geocoder.getFromLocation(location.getLatitude(), location.getLongitude(), 1);
            if (addresses != null && !addresses.isEmpty()) {
                Address address = addresses.get(0);
                String locality = firstNonEmpty(address.getSubLocality(), address.getLocality(), address.getSubAdminArea());
                String region = firstNonEmpty(address.getAdminArea(), address.getCountryName());
                String label = locality != null && region != null ? locality + ", " + region : firstNonEmpty(locality, region);
                if (!TextUtils.isEmpty(label)) {
                    return label;
                }
            }
        } catch (IOException ignored) {
        }

        return String.format(Locale.US, "%.5f, %.5f", location.getLatitude(), location.getLongitude());
    }

    private String firstNonEmpty(String... values) {
        for (String value : values) {
            if (!TextUtils.isEmpty(value)) {
                return value;
            }
        }
        return null;
    }

    private void submitTrip() {
        String from = getInput(binding.startFromInput);
        String to = getInput(binding.startToInput);
        String freight = getInput(binding.startFreightInput);
        String meter = getInput(binding.startMeterInput);
        String token = sessionManager.getToken();

        if (TextUtils.isEmpty(from) || TextUtils.isEmpty(to) || TextUtils.isEmpty(freight) || TextUtils.isEmpty(meter)) {
            Toast.makeText(this, R.string.fill_required_trip_fields, Toast.LENGTH_SHORT).show();
            return;
        }

        if (meterImageUri == null || biltySlipImageUri == null) {
            Toast.makeText(this, R.string.trip_required_images, Toast.LENGTH_SHORT).show();
            return;
        }

        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("from_location", from);
        fields.put("to_location", to);
        fields.put("freight_charge", freight);
        fields.put("meter_reading", meter);
        fields.put("bilty_commission_amount", getNumericInput(binding.biltyCommissionInput));
        fields.put("start_live_location", TextUtils.isEmpty(fetchedStartLocation) ? from : fetchedStartLocation);

        setSubmitting(true);

        ApiClient.startTrip(baseUrl, token, fields, meterImageUri, biltySlipImageUri, getContentResolver(), new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                Log.e(TAG, "Start trip request failed", e);
                runOnUiThread(() -> {
                    setSubmitting(false);
                    String message = e.getMessage() != null && !e.getMessage().trim().isEmpty()
                            ? "Unable to start trip: " + e.getMessage()
                            : "Unable to start trip";
                    Toast.makeText(StartTripActivity.this, message, Toast.LENGTH_LONG).show();
                });
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String body = response.body() != null ? response.body().string() : "";

                if (!response.isSuccessful()) {
                    String message = ApiClient.parseErrorMessage(body, "Failed to start trip");
                    runOnUiThread(() -> {
                        setSubmitting(false);
                        Toast.makeText(StartTripActivity.this, message, Toast.LENGTH_LONG).show();
                    });
                    return;
                }

                String routeText = from + " to " + to;
                String createdTripId = null;
                try {
                    JSONObject root = new JSONObject(body);
                    JSONObject trip = root.optJSONObject("trip");
                    if (trip != null) {
                        createdTripId = trip.optString("id", null);
                    }
                } catch (Exception ignored) {
                }

                String finalCreatedTripId = createdTripId;
                runOnUiThread(() -> showSuccess(routeText, finalCreatedTripId));
            }
        });
    }

    private void showSuccess(String routeText, String tripId) {
        setSubmitting(false);
        binding.successRouteText.setText(routeText);
        binding.successState.setVisibility(View.VISIBLE);
        binding.submitTripButton.setVisibility(View.GONE);
        binding.formCard.setVisibility(View.GONE);
        binding.successCloseButton.setOnClickListener(v -> {
            setResult(RESULT_OK);
            if (!TextUtils.isEmpty(tripId)) {
                Intent intent = new Intent(StartTripActivity.this, EndTripActivity.class);
                intent.putExtra(EndTripActivity.EXTRA_TRIP_ID, tripId);
                intent.putExtra(EndTripActivity.EXTRA_ROUTE, routeText);
                intent.putExtra(EndTripActivity.EXTRA_LOCKED_MODE, true);
                startActivity(intent);
            }
            finish();
        });
    }

    private void setSubmitting(boolean submitting) {
        binding.loadingOverlay.setVisibility(submitting ? View.VISIBLE : View.GONE);
        binding.submitTripButton.setEnabled(!submitting);
        binding.backButton.setEnabled(!submitting);
        binding.fetchStartLocationButton.setEnabled(!submitting);
    }

    private String getInput(com.google.android.material.textfield.TextInputEditText input) {
        return input.getText() != null ? input.getText().toString().trim() : "";
    }

    private String getNumericInput(com.google.android.material.textfield.TextInputEditText input) {
        String value = getInput(input);
        return TextUtils.isEmpty(value) ? "0" : value;
    }
}
