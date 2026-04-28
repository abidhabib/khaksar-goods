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
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.example.ishaqcargo.databinding.ActivityStartTripBinding;
import com.example.ishaqcargo.network.ApiClient;
import com.example.ishaqcargo.util.SessionManager;

import org.json.JSONObject;

import java.io.File;
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
    public static final String EXTRA_INITIAL_METER = "initial_meter";
    private static final String STATE_FROM = "state_from";
    private static final String STATE_METER = "state_meter";
    private static final String STATE_LOAD_WEIGHT = "state_load_weight";
    private static final String STATE_FREIGHT = "state_freight";
    private static final String STATE_BILTY_COMMISSION = "state_bilty_commission";
    private static final String STATE_START_LOCATION_LABEL = "state_start_location_label";
    private static final String STATE_START_LOCATION_COORDS = "state_start_location_coords";
    private static final String STATE_METER_URI = "state_meter_uri";
    private static final String STATE_BILTY_URI = "state_bilty_uri";
    private static final String STATE_PENDING_METER_URI = "state_pending_meter_uri";
    private static final String STATE_PENDING_BILTY_URI = "state_pending_bilty_uri";

    private ActivityStartTripBinding binding;
    private SessionManager sessionManager;
    private Uri meterImageUri;
    private Uri biltySlipImageUri;
    private Uri pendingMeterCameraUri;
    private Uri pendingBiltyCameraUri;
    private String baseUrl;
    private String fetchedStartLocation;
    private String fetchedStartCoordinates;
    private Runnable startLocationTimeoutRunnable;
    private double initialMeterReading;

    private final ActivityResultLauncher<Uri> takeMeterPhotoLauncher = registerForActivityResult(
            new ActivityResultContracts.TakePicture(),
            success -> {
                if (success && pendingMeterCameraUri != null) {
                    meterImageUri = pendingMeterCameraUri;
                    bindMeterImagePreview();
                } else {
                    pendingMeterCameraUri = null;
                }
            }
    );

    private final ActivityResultLauncher<Uri> takeBiltyPhotoLauncher = registerForActivityResult(
            new ActivityResultContracts.TakePicture(),
            success -> {
                if (success && pendingBiltyCameraUri != null) {
                    biltySlipImageUri = pendingBiltyCameraUri;
                    bindBiltyImagePreview();
                } else {
                    pendingBiltyCameraUri = null;
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
        initialMeterReading = getIntent().getDoubleExtra(EXTRA_INITIAL_METER, 0);

        applyWindowInsets();
        clearDraftState();
        restoreTransientState(savedInstanceState);
        // bindInitialMeterIfNeeded(); // Removed: don't fill previous reading in start meter reading

        binding.backButton.setOnClickListener(v -> finish());
        binding.startMeterImagePreview.setOnClickListener(v -> openCameraForMeterPhoto());
        binding.startUploadHint.setOnClickListener(v -> openCameraForMeterPhoto());
        binding.biltyImagePreview.setOnClickListener(v -> openCameraForBiltyPhoto());
        binding.biltyUploadHint.setOnClickListener(v -> openCameraForBiltyPhoto());
        binding.fetchStartLocationButton.setOnClickListener(v -> ensureLocationPermissionAndFetch());
        binding.submitTripButton.setOnClickListener(v -> submitTrip());
        ((View) binding.startToInput.getParent().getParent()).setVisibility(View.GONE);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        outState.putString(STATE_FROM, getInput(binding.startFromInput));
        outState.putString(STATE_METER, getInput(binding.startMeterInput));
        outState.putString(STATE_LOAD_WEIGHT, getInput(binding.loadWeightInput));
        outState.putString(STATE_FREIGHT, getInput(binding.freightChargeInput));
        outState.putString(STATE_BILTY_COMMISSION, getInput(binding.biltyCommissionInput));
        outState.putString(STATE_START_LOCATION_LABEL, fetchedStartLocation);
        outState.putString(STATE_START_LOCATION_COORDS, fetchedStartCoordinates);
        outState.putString(STATE_METER_URI, meterImageUri != null ? meterImageUri.toString() : null);
        outState.putString(STATE_BILTY_URI, biltySlipImageUri != null ? biltySlipImageUri.toString() : null);
        outState.putString(STATE_PENDING_METER_URI, pendingMeterCameraUri != null ? pendingMeterCameraUri.toString() : null);
        outState.putString(STATE_PENDING_BILTY_URI, pendingBiltyCameraUri != null ? pendingBiltyCameraUri.toString() : null);
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

    private void bindInitialMeterIfNeeded() {
        if (initialMeterReading > 0 && TextUtils.isEmpty(getInput(binding.startMeterInput))) {
            binding.startMeterInput.setText(String.format(Locale.US, "%.0f", initialMeterReading));
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
        fetchedStartCoordinates = formatCoordinates(location);
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

        return String.format(Locale.US, "%.5f, %.5f", location.getLatitude(), location.getLongitude());
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

    private void openCameraForMeterPhoto() {
        try {
            pendingMeterCameraUri = createTempImageUri("start_meter_");
            takeMeterPhotoLauncher.launch(pendingMeterCameraUri);
        } catch (Exception exception) {
            Toast.makeText(this, R.string.unable_to_open_camera, Toast.LENGTH_SHORT).show();
        }
    }

    private void openCameraForBiltyPhoto() {
        try {
            pendingBiltyCameraUri = createTempImageUri("bilty_slip_");
            takeBiltyPhotoLauncher.launch(pendingBiltyCameraUri);
        } catch (Exception exception) {
            Toast.makeText(this, R.string.unable_to_open_camera, Toast.LENGTH_SHORT).show();
        }
    }

    private Uri createTempImageUri(String prefix) throws IOException {
        File mediaDir = new File(getFilesDir(), "trip-media");
        if (!mediaDir.exists() && !mediaDir.mkdirs()) {
            throw new IOException("Unable to create media directory");
        }

        File imageFile = File.createTempFile(prefix + System.currentTimeMillis(), ".jpg", mediaDir);
        return FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", imageFile);
    }

    private void bindMeterImagePreview() {
        if (meterImageUri == null) {
            return;
        }
        binding.startMeterImagePreview.setImageURI(meterImageUri);
        binding.startMeterImagePreview.setVisibility(View.VISIBLE);
        binding.startUploadHint.setText(R.string.start_trip_change_photo);
    }

    private void bindBiltyImagePreview() {
        if (biltySlipImageUri == null) {
            return;
        }
        binding.biltyImagePreview.setImageURI(biltySlipImageUri);
        binding.biltyImagePreview.setVisibility(View.VISIBLE);
        binding.biltyUploadHint.setText(R.string.bilty_change_photo);
    }

    private void submitTrip() {
        String from = getInput(binding.startFromInput);
        String meter = getInput(binding.startMeterInput);
        String loadWeight = getInput(binding.loadWeightInput);
        String freightAmount = getInput(binding.freightChargeInput);
        String biltyCommissionAmount = getInput(binding.biltyCommissionInput);
        String token = sessionManager.getToken();

        if (TextUtils.isEmpty(from)
                || TextUtils.isEmpty(meter)
                || TextUtils.isEmpty(freightAmount)
                || TextUtils.isEmpty(loadWeight)) {
            Toast.makeText(this, R.string.fill_required_trip_fields, Toast.LENGTH_SHORT).show();
            return;
        }

        if (meterImageUri == null || biltySlipImageUri == null) {
            Toast.makeText(this, R.string.start_trip_required_images, Toast.LENGTH_SHORT).show();
            return;
        }

        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("from_location", from);
        fields.put("freight_charge", freightAmount);
        fields.put("meter_reading", meter);
        fields.put("load_weight", loadWeight);
        fields.put("bilty_commission_amount", TextUtils.isEmpty(biltyCommissionAmount) ? "0" : biltyCommissionAmount);
        fields.put("start_live_location", TextUtils.isEmpty(fetchedStartLocation) ? from : fetchedStartLocation);
        if (!TextUtils.isEmpty(fetchedStartCoordinates)) {
            fields.put("start_coordinates", fetchedStartCoordinates);
        }

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

                String routeText = from;
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
                String startMeterValue = meter;
                String finalLoadWeight = loadWeight;
                runOnUiThread(() -> openLoadDetailsScreen(routeText, finalCreatedTripId, startMeterValue, from, finalLoadWeight));
            }
        });
    }

    private void openLoadDetailsScreen(String routeText, String tripId, String startMeterValue, String destination, String loadWeight) {
        clearDraftState();
        setSubmitting(false);

        if (TextUtils.isEmpty(tripId)) {
            finish();
            return;
        }

        Intent intent = new Intent(this, LoadDetailsActivity.class);
        intent.putExtra(EndTripActivity.EXTRA_TRIP_ID, tripId);
        intent.putExtra(EndTripActivity.EXTRA_ROUTE, routeText);
        intent.putExtra(EndTripActivity.EXTRA_START_METER, parseDouble(startMeterValue));
        intent.putExtra(EndTripActivity.EXTRA_DESTINATION, destination);
        intent.putExtra(EndTripActivity.EXTRA_LOCKED_MODE, true);
        intent.putExtra(LoadDetailsActivity.EXTRA_LOAD_WEIGHT, loadWeight);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(intent);
        finish();
    }

    private void setSubmitting(boolean submitting) {
        binding.loadingOverlay.setVisibility(submitting ? View.VISIBLE : View.GONE);
        binding.submitTripButton.setEnabled(!submitting);
        binding.backButton.setEnabled(!submitting);
        binding.fetchStartLocationButton.setEnabled(!submitting);
    }

    private void clearDraftState() {
        fetchedStartLocation = null;
        fetchedStartCoordinates = null;
        meterImageUri = null;
        biltySlipImageUri = null;
        pendingMeterCameraUri = null;
        pendingBiltyCameraUri = null;
    }

    private void restoreTransientState(Bundle savedInstanceState) {
        if (savedInstanceState == null) {
            return;
        }

        binding.startFromInput.setText(savedInstanceState.getString(STATE_FROM, ""));
        binding.startMeterInput.setText(savedInstanceState.getString(STATE_METER, ""));
        binding.loadWeightInput.setText(savedInstanceState.getString(STATE_LOAD_WEIGHT, ""));
        binding.freightChargeInput.setText(savedInstanceState.getString(STATE_FREIGHT, ""));
        binding.biltyCommissionInput.setText(savedInstanceState.getString(STATE_BILTY_COMMISSION, ""));
        fetchedStartLocation = savedInstanceState.getString(STATE_START_LOCATION_LABEL);
        fetchedStartCoordinates = savedInstanceState.getString(STATE_START_LOCATION_COORDS);
        meterImageUri = parseUri(savedInstanceState.getString(STATE_METER_URI));
        biltySlipImageUri = parseUri(savedInstanceState.getString(STATE_BILTY_URI));
        pendingMeterCameraUri = parseUri(savedInstanceState.getString(STATE_PENDING_METER_URI));
        pendingBiltyCameraUri = parseUri(savedInstanceState.getString(STATE_PENDING_BILTY_URI));

        if (meterImageUri != null) {
            bindMeterImagePreview();
        }
        if (biltySlipImageUri != null) {
            bindBiltyImagePreview();
        }
    }

    private Uri parseUri(String value) {
        return TextUtils.isEmpty(value) ? null : Uri.parse(value);
    }

    private String getInput(com.google.android.material.textfield.TextInputEditText input) {
        return input.getText() != null ? input.getText().toString().trim() : "";
    }

    private double parseDouble(String value) {
        try {
            return Double.parseDouble(value);
        } catch (Exception ignored) {
            return 0;
        }
    }
}
