package com.example.ishaqcargo;

import android.Manifest;
import android.content.Intent;
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
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.example.ishaqcargo.databinding.ActivityLoadDetailsBinding;
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

public class LoadDetailsActivity extends AppCompatActivity {

    public static final String EXTRA_LOAD_WEIGHT = "load_weight";
    private static final String PREF_NAME = "load_details_drafts";
    private static final String STATE_PENDING_URI = "state_pending_uri";

    private ActivityLoadDetailsBinding binding;
    private SessionManager sessionManager;
    private String baseUrl;
    private String tripId;
    private String routeText;
    private String tripDestination;
    private String loadWeight;
    private String fetchedLoadLocation;
    private String fetchedLoadCoordinates;
    private Uri loadPhotoUri;
    private Uri pendingLoadPhotoUri;
    private Runnable loadLocationTimeoutRunnable;

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

    private final ActivityResultLauncher<Uri> takeLoadPhotoLauncher = registerForActivityResult(
            new ActivityResultContracts.TakePicture(),
            success -> {
                if (success && pendingLoadPhotoUri != null) {
                    loadPhotoUri = pendingLoadPhotoUri;
                    bindLoadImagePreview();
                } else {
                    pendingLoadPhotoUri = null;
                }
            }
    );

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        binding = ActivityLoadDetailsBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());
        WindowCompat.getInsetsController(getWindow(), binding.getRoot()).setAppearanceLightStatusBars(true);

        sessionManager = new SessionManager(this);
        baseUrl = sessionManager.getBaseUrl();
        tripId = getIntent().getStringExtra(EndTripActivity.EXTRA_TRIP_ID);
        routeText = getIntent().getStringExtra(EndTripActivity.EXTRA_ROUTE);
        tripDestination = getIntent().getStringExtra(EndTripActivity.EXTRA_DESTINATION);
        loadWeight = getIntent().getStringExtra(EXTRA_LOAD_WEIGHT);

        applyWindowInsets();
        bindStaticContent();
        restoreDraft();
        restoreTransientState(savedInstanceState);
        bindCoordinatesText();

        binding.backButton.setOnClickListener(v -> moveTaskToBack(true));
        binding.loadPhotoPreview.setOnClickListener(v -> openCameraForLoadPhoto());
        binding.loadUploadHint.setOnClickListener(v -> openCameraForLoadPhoto());
        binding.fetchLoadLocationButton.setOnClickListener(v -> ensureLocationPermissionAndFetch());
        binding.submitLoadDetailsButton.setOnClickListener(v -> submitLoadDetails());

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                moveTaskToBack(true);
            }
        });

        loadTripDetails();
        ensureLocationPermissionAndFetch();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        outState.putString(STATE_PENDING_URI, pendingLoadPhotoUri != null ? pendingLoadPhotoUri.toString() : null);
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

    private void bindStaticContent() {
        binding.routeSummary.setText(TextUtils.isEmpty(routeText) ? "-" : routeText);
        binding.loadWeightSummary.setText(
                TextUtils.isEmpty(loadWeight)
                        ? getString(R.string.load_weight_pending)
                        : getString(R.string.load_weight_value, loadWeight)
        );
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

        String apiRouteText = getString(
                R.string.trip_route_format,
                trip.optString("from_location", "-"),
                trip.optString("to_location", "-")
        );
        binding.routeSummary.setText(apiRouteText);

        String apiLoadWeight = trip.optString("load_weight", "");
        if (!TextUtils.isEmpty(apiLoadWeight)) {
            loadWeight = apiLoadWeight;
            binding.loadWeightSummary.setText(getString(R.string.load_weight_value, apiLoadWeight));
        }

        String apiLocation = trip.optString("load_live_location", "");
        if ("null".equalsIgnoreCase(apiLocation)) apiLocation = "";
        if (TextUtils.isEmpty(getInput(binding.loadLocationInput)) && !TextUtils.isEmpty(apiLocation)) {
            fetchedLoadLocation = apiLocation;
            binding.loadLocationInput.setText(apiLocation);
        }

        String apiCoordinates = trip.optString("load_coordinates", "");
        if ("null".equalsIgnoreCase(apiCoordinates)) apiCoordinates = "";
        if (TextUtils.isEmpty(fetchedLoadCoordinates) && !TextUtils.isEmpty(apiCoordinates)) {
            fetchedLoadCoordinates = apiCoordinates;
            bindCoordinatesText();
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

        binding.fetchLoadLocationButton.setEnabled(false);

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
            clearLoadLocationTimeout();
            loadLocationTimeoutRunnable = () -> {
                try {
                    locationManager.removeUpdates(listener);
                } catch (Exception ignored) {
                }
                binding.fetchLoadLocationButton.setEnabled(true);
                Toast.makeText(LoadDetailsActivity.this, R.string.location_unavailable, Toast.LENGTH_SHORT).show();
            };
            binding.fetchLoadLocationButton.postDelayed(loadLocationTimeoutRunnable, 8000L);
        } catch (Exception exception) {
            clearLoadLocationTimeout();
            binding.fetchLoadLocationButton.setEnabled(true);
            Toast.makeText(this, R.string.location_unavailable, Toast.LENGTH_SHORT).show();
        }
    }

    private void handleLocationResult(Location location) {
        clearLoadLocationTimeout();
        binding.fetchLoadLocationButton.setEnabled(true);

        if (location == null) {
            Toast.makeText(this, R.string.location_unavailable, Toast.LENGTH_SHORT).show();
            return;
        }

        String resolvedLocation = buildLocationLabel(location);
        fetchedLoadCoordinates = formatCoordinates(location);
        fetchedLoadLocation = resolvedLocation;
        binding.loadLocationInput.setText(resolvedLocation);
        binding.loadLocationInput.setSelection(resolvedLocation.length());
        bindCoordinatesText();
        Toast.makeText(this, R.string.location_fetched_success, Toast.LENGTH_SHORT).show();
    }

    private void clearLoadLocationTimeout() {
        if (loadLocationTimeoutRunnable != null) {
            binding.fetchLoadLocationButton.removeCallbacks(loadLocationTimeoutRunnable);
            loadLocationTimeoutRunnable = null;
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

    private void bindCoordinatesText() {
        if (TextUtils.isEmpty(fetchedLoadCoordinates)) {
            binding.loadCoordinatesText.setText(R.string.load_coordinates_pending);
            return;
        }

        binding.loadCoordinatesText.setText(getString(R.string.load_coordinates_value, fetchedLoadCoordinates));
    }

    private void openCameraForLoadPhoto() {
        try {
            pendingLoadPhotoUri = createTempImageUri("load_photo_");
            takeLoadPhotoLauncher.launch(pendingLoadPhotoUri);
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

    private void bindLoadImagePreview() {
        if (loadPhotoUri == null) {
            return;
        }
        binding.loadPhotoPreview.setImageURI(loadPhotoUri);
        binding.loadPhotoPreview.setVisibility(android.view.View.VISIBLE);
        binding.loadUploadHint.setText(R.string.load_change_photo);
    }

    private void submitLoadDetails() {
        String loadLocation = getInput(binding.loadLocationInput);
        if (TextUtils.isEmpty(tripId) || TextUtils.isEmpty(loadLocation)) {
            Toast.makeText(this, R.string.load_location_required, Toast.LENGTH_SHORT).show();
            return;
        }

        if (TextUtils.isEmpty(fetchedLoadCoordinates)) {
            Toast.makeText(this, R.string.load_coordinates_required, Toast.LENGTH_SHORT).show();
            return;
        }

        if (loadPhotoUri == null) {
            Toast.makeText(this, R.string.load_photo_only_required, Toast.LENGTH_SHORT).show();
            return;
        }

        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("load_live_location", loadLocation);
        fields.put("load_coordinates", fetchedLoadCoordinates);

        setSubmitting(true);

        ApiClient.saveTripLoadDetails(baseUrl, sessionManager.getToken(), tripId, fields, loadPhotoUri, getContentResolver(), new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                runOnUiThread(() -> {
                    setSubmitting(false);
                    Toast.makeText(LoadDetailsActivity.this, R.string.unable_to_save_load_details, Toast.LENGTH_LONG).show();
                });
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String body = response.body() != null ? response.body().string() : "";
                if (!response.isSuccessful()) {
                    String message = ApiClient.parseErrorMessage(body, getString(R.string.unable_to_save_load_details));
                    runOnUiThread(() -> {
                        setSubmitting(false);
                        Toast.makeText(LoadDetailsActivity.this, message, Toast.LENGTH_LONG).show();
                    });
                    return;
                }

                runOnUiThread(LoadDetailsActivity.this::openTripExpensesScreen);
            }
        });
    }

    private void openTripExpensesScreen() {
        clearDraft();
        setSubmitting(false);

        Intent intent = new Intent(this, EndTripActivity.class);
        intent.putExtra(EndTripActivity.EXTRA_TRIP_ID, tripId);
        intent.putExtra(EndTripActivity.EXTRA_ROUTE, binding.routeSummary.getText().toString());
        intent.putExtra(EndTripActivity.EXTRA_DESTINATION, tripDestination);
        intent.putExtra(EndTripActivity.EXTRA_LOCKED_MODE, true);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(intent);
        finish();
    }

    private void setSubmitting(boolean submitting) {
        binding.loadingOverlay.setVisibility(submitting ? android.view.View.VISIBLE : android.view.View.GONE);
        binding.submitLoadDetailsButton.setEnabled(!submitting);
        binding.fetchLoadLocationButton.setEnabled(!submitting);
        binding.backButton.setEnabled(!submitting);
        binding.loadUploadHint.setEnabled(!submitting);
    }

    private void saveDraft() {
        if (TextUtils.isEmpty(tripId)) {
            return;
        }

        SharedPreferences preferences = getSharedPreferences(PREF_NAME, MODE_PRIVATE);
        preferences.edit()
                .putString(tripId + "_load_location", getInput(binding.loadLocationInput))
                .putString(tripId + "_fetched_load_location", fetchedLoadLocation)
                .putString(tripId + "_fetched_load_coordinates", fetchedLoadCoordinates)
                .putString(tripId + "_load_photo_uri", loadPhotoUri != null ? loadPhotoUri.toString() : null)
                .apply();
    }

    private void restoreDraft() {
        if (TextUtils.isEmpty(tripId)) {
            return;
        }

        SharedPreferences preferences = getSharedPreferences(PREF_NAME, MODE_PRIVATE);
        String loadLocation = preferences.getString(tripId + "_load_location", "");
        fetchedLoadLocation = preferences.getString(tripId + "_fetched_load_location", null);
        fetchedLoadCoordinates = preferences.getString(tripId + "_fetched_load_coordinates", null);
        String loadPhoto = preferences.getString(tripId + "_load_photo_uri", null);

        if (!TextUtils.isEmpty(loadLocation)) {
            binding.loadLocationInput.setText(loadLocation);
        }
        if (!TextUtils.isEmpty(loadPhoto)) {
            loadPhotoUri = Uri.parse(loadPhoto);
            bindLoadImagePreview();
        }
    }

    private void clearDraft() {
        if (TextUtils.isEmpty(tripId)) {
            return;
        }

        SharedPreferences preferences = getSharedPreferences(PREF_NAME, MODE_PRIVATE);
        preferences.edit()
                .remove(tripId + "_load_location")
                .remove(tripId + "_fetched_load_location")
                .remove(tripId + "_fetched_load_coordinates")
                .remove(tripId + "_load_photo_uri")
                .apply();
    }

    private void restoreTransientState(Bundle savedInstanceState) {
        if (savedInstanceState == null) {
            return;
        }

        String pendingUri = savedInstanceState.getString(STATE_PENDING_URI);
        if (!TextUtils.isEmpty(pendingUri)) {
            pendingLoadPhotoUri = Uri.parse(pendingUri);
        }
    }

    private String getInput(com.google.android.material.textfield.TextInputEditText input) {
        return input.getText() != null ? input.getText().toString().trim() : "";
    }
}
