package com.example.ishaqcargo;

import android.Manifest;
import android.content.SharedPreferences;
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
import androidx.core.content.FileProvider;

import com.example.ishaqcargo.databinding.ActivityEndTripDetailsBinding;
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

public class EndTripDetailsActivity extends AppCompatActivity {

    private static final String PREF_NAME = "end_trip_details_drafts";
    private static final String STATE_PENDING_URI = "state_pending_uri";

    private ActivityEndTripDetailsBinding binding;
    private SessionManager sessionManager;
    private String baseUrl;
    private Uri meterImageUri;
    private Uri pendingCameraUri;
    private String tripId;
    private String fetchedEndLocation;
    private String fetchedEndCoordinates;
    private Runnable endLocationTimeoutRunnable;
    private double tripStartMeter;
    private String tripDestination;

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

    private final ActivityResultLauncher<Uri> takeMeterPhotoLauncher = registerForActivityResult(
            new ActivityResultContracts.TakePicture(),
            success -> {
                if (success && pendingCameraUri != null) {
                    meterImageUri = pendingCameraUri;
                    binding.endMeterImagePreview.setImageURI(meterImageUri);
                    binding.endMeterImagePreview.setVisibility(View.VISIBLE);
                    binding.endUploadHint.setText(R.string.end_trip_change_photo);
                } else {
                    pendingCameraUri = null;
                }
            }
    );

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        binding = ActivityEndTripDetailsBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());
        WindowCompat.getInsetsController(getWindow(), binding.getRoot()).setAppearanceLightStatusBars(true);

        sessionManager = new SessionManager(this);
        baseUrl = sessionManager.getBaseUrl();
        tripId = getIntent().getStringExtra(EndTripActivity.EXTRA_TRIP_ID);
        tripStartMeter = getIntent().getDoubleExtra(EndTripActivity.EXTRA_START_METER, 0);
        tripDestination = getIntent().getStringExtra(EndTripActivity.EXTRA_DESTINATION);

        applyWindowInsets();
        bindStaticTripDetails();
        restoreDraft();
        restoreTransientState(savedInstanceState);

        binding.backButton.setOnClickListener(v -> finish());
        binding.endMeterImagePreview.setOnClickListener(v -> openCameraForMeterPhoto());
        binding.endUploadHint.setOnClickListener(v -> openCameraForMeterPhoto());
        binding.fetchEndLocationButton.setOnClickListener(v -> ensureLocationPermissionAndFetch());
        binding.submitTripButton.setOnClickListener(v -> submitTrip());
        binding.successCloseButton.setOnClickListener(v -> {
            setResult(RESULT_OK);
            finish();
        });

        loadTripDetails();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        outState.putString(STATE_PENDING_URI, pendingCameraUri != null ? pendingCameraUri.toString() : null);
    }

    @Override
    protected void onPause() {
        super.onPause();
        saveDraft();
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

    private void bindStaticTripDetails() {
        binding.routeSummary.setText(getIntent().getStringExtra(EndTripActivity.EXTRA_ROUTE));
        binding.tripDestinationValue.setText(TextUtils.isEmpty(tripDestination) ? "-" : tripDestination);

        String startMeterText = tripStartMeter > 0 ? String.format(Locale.US, "%.0f", tripStartMeter) : "-";
        binding.tripStartMeterValue.setText(getString(R.string.started_meter_value, startMeterText));
    }

    private void loadTripDetails() {
        if (TextUtils.isEmpty(tripId)) {
            return;
        }

        ApiClient.getTripDetails(baseUrl, sessionManager.getToken(), tripId, new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String body = response.body() != null ? response.body().string() : "";
                if (!response.isSuccessful()) {
                    return;
                }

                try {
                    JSONObject root = new JSONObject(body);
                    JSONObject trip = root.optJSONObject("trip");
                    runOnUiThread(() -> bindTripFromApi(trip));
                } catch (Exception ignored) {
                }
            }
        });
    }

    private void bindTripFromApi(JSONObject trip) {
        if (trip == null) {
            return;
        }

        String destination = trip.optString("to_location", "");
        if (!TextUtils.isEmpty(destination)) {
            tripDestination = destination;
            binding.tripDestinationValue.setText(destination);
        }

        double startMeter = trip.optDouble("start_meter_reading", tripStartMeter);
        if (startMeter > 0) {
            tripStartMeter = startMeter;
            String startMeterText = String.format(Locale.US, "%.0f", startMeter);
            binding.tripStartMeterValue.setText(getString(R.string.started_meter_value, startMeterText));
        }
    }

    private void openCameraForMeterPhoto() {
        try {
            pendingCameraUri = createTempImageUri("end_meter_");
            takeMeterPhotoLauncher.launch(pendingCameraUri);
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

        binding.fetchEndLocationButton.setEnabled(false);

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
            clearEndLocationTimeout();
            endLocationTimeoutRunnable = () -> {
                try {
                    locationManager.removeUpdates(listener);
                } catch (Exception ignored) {
                }
                binding.fetchEndLocationButton.setEnabled(true);
                Toast.makeText(EndTripDetailsActivity.this, R.string.location_unavailable, Toast.LENGTH_SHORT).show();
            };
            binding.fetchEndLocationButton.postDelayed(endLocationTimeoutRunnable, 8000L);
        } catch (Exception exception) {
            clearEndLocationTimeout();
            binding.fetchEndLocationButton.setEnabled(true);
            Toast.makeText(this, R.string.location_unavailable, Toast.LENGTH_SHORT).show();
        }
    }

    private void handleLocationResult(Location location) {
        clearEndLocationTimeout();
        binding.fetchEndLocationButton.setEnabled(true);

        if (location == null) {
            Toast.makeText(this, R.string.location_unavailable, Toast.LENGTH_SHORT).show();
            return;
        }

        String resolvedLocation = buildLocationLabel(location);
        fetchedEndCoordinates = formatCoordinates(location);
        fetchedEndLocation = resolvedLocation;
        binding.endLocationInput.setText(resolvedLocation);
        binding.endLocationInput.setSelection(resolvedLocation.length());
        Toast.makeText(this, R.string.location_fetched_success, Toast.LENGTH_SHORT).show();
    }

    private void clearEndLocationTimeout() {
        if (endLocationTimeoutRunnable != null) {
            binding.fetchEndLocationButton.removeCallbacks(endLocationTimeoutRunnable);
            endLocationTimeoutRunnable = null;
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

    private String firstNonEmpty(String... values) {
        for (String value : values) {
            if (!TextUtils.isEmpty(value)) {
                return value;
            }
        }
        return null;
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

    private void submitTrip() {
        String meter = getInput(binding.endMeterInput);
        String endLocation = getInput(binding.endLocationInput);

        if (TextUtils.isEmpty(tripId) || TextUtils.isEmpty(meter) || TextUtils.isEmpty(endLocation)) {
            Toast.makeText(this, R.string.end_trip_required_fields, Toast.LENGTH_SHORT).show();
            return;
        }

        if (meterImageUri == null) {
            Toast.makeText(this, R.string.end_meter_photo_required, Toast.LENGTH_SHORT).show();
            return;
        }

        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("meter_reading", meter);
        fields.put("end_location", endLocation);
        fields.put("end_live_location", TextUtils.isEmpty(fetchedEndLocation) ? endLocation : fetchedEndLocation);
        if (!TextUtils.isEmpty(fetchedEndCoordinates)) {
            fields.put("end_coordinates", fetchedEndCoordinates);
        }

        setSubmitting(true);

        ApiClient.endTrip(baseUrl, sessionManager.getToken(), tripId, fields, meterImageUri, getContentResolver(), new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                runOnUiThread(() -> {
                    setSubmitting(false);
                    Toast.makeText(EndTripDetailsActivity.this, R.string.unable_to_end_trip, Toast.LENGTH_LONG).show();
                });
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String body = response.body() != null ? response.body().string() : "";

                if (!response.isSuccessful()) {
                    String message = ApiClient.parseErrorMessage(body, getString(R.string.unable_to_end_trip));
                    runOnUiThread(() -> {
                        setSubmitting(false);
                        Toast.makeText(EndTripDetailsActivity.this, message, Toast.LENGTH_LONG).show();
                    });
                    return;
                }

                runOnUiThread(EndTripDetailsActivity.this::showSuccess);
            }
        });
    }

    private void showSuccess() {
        clearDraft();
        setSubmitting(false);
        binding.successState.setVisibility(View.VISIBLE);
        binding.formCard.setVisibility(View.GONE);
    }

    private void setSubmitting(boolean submitting) {
        binding.loadingOverlay.setVisibility(submitting ? View.VISIBLE : View.GONE);
        binding.submitTripButton.setEnabled(!submitting);
        binding.fetchEndLocationButton.setEnabled(!submitting);
        binding.endUploadHint.setEnabled(!submitting);
    }

    private void saveDraft() {
        if (TextUtils.isEmpty(tripId)) {
            return;
        }

        SharedPreferences preferences = getSharedPreferences(PREF_NAME, MODE_PRIVATE);
        preferences.edit()
                .putString(tripId + "_end_location", getInput(binding.endLocationInput))
                .putString(tripId + "_end_meter", getInput(binding.endMeterInput))
                .putString(tripId + "_fetched_end_location", fetchedEndLocation)
                .putString(tripId + "_fetched_end_coordinates", fetchedEndCoordinates)
                .putString(tripId + "_meter_image_uri", meterImageUri != null ? meterImageUri.toString() : null)
                .apply();
    }

    private void restoreDraft() {
        if (TextUtils.isEmpty(tripId)) {
            return;
        }

        SharedPreferences preferences = getSharedPreferences(PREF_NAME, MODE_PRIVATE);
        String endLocation = preferences.getString(tripId + "_end_location", "");
        String endMeter = preferences.getString(tripId + "_end_meter", "");
        fetchedEndLocation = preferences.getString(tripId + "_fetched_end_location", null);
        fetchedEndCoordinates = preferences.getString(tripId + "_fetched_end_coordinates", null);
        String meterImage = preferences.getString(tripId + "_meter_image_uri", null);

        if (!TextUtils.isEmpty(endLocation)) {
            binding.endLocationInput.setText(endLocation);
        }
        if (!TextUtils.isEmpty(endMeter)) {
            binding.endMeterInput.setText(endMeter);
        }
        if (!TextUtils.isEmpty(meterImage)) {
            meterImageUri = Uri.parse(meterImage);
            binding.endMeterImagePreview.setImageURI(meterImageUri);
            binding.endMeterImagePreview.setVisibility(View.VISIBLE);
            binding.endUploadHint.setText(R.string.end_trip_change_photo);
        }
    }

    private void clearDraft() {
        if (TextUtils.isEmpty(tripId)) {
            return;
        }

        SharedPreferences preferences = getSharedPreferences(PREF_NAME, MODE_PRIVATE);
        preferences.edit()
                .remove(tripId + "_end_location")
                .remove(tripId + "_end_meter")
                .remove(tripId + "_fetched_end_location")
                .remove(tripId + "_fetched_end_coordinates")
                .remove(tripId + "_meter_image_uri")
                .apply();
    }

    private void restoreTransientState(Bundle savedInstanceState) {
        if (savedInstanceState == null) {
            return;
        }

        String pendingUri = savedInstanceState.getString(STATE_PENDING_URI);
        if (!TextUtils.isEmpty(pendingUri)) {
            pendingCameraUri = Uri.parse(pendingUri);
        }
    }

    private String getInput(com.google.android.material.textfield.TextInputEditText input) {
        return input.getText() != null ? input.getText().toString().trim() : "";
    }
}
