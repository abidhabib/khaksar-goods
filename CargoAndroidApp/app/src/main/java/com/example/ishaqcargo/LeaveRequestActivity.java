package com.example.ishaqcargo;

import android.Manifest;
import android.content.ContentResolver;
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
import android.text.TextUtils;
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

import com.example.ishaqcargo.databinding.ActivityLeaveRequestBinding;
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

public class LeaveRequestActivity extends AppCompatActivity {
    private static final String STATE_METER_READING = "state_meter_reading";
    private static final String STATE_LOCATION_TEXT = "state_location_text";
    private static final String STATE_COORDINATES = "state_coordinates";
    private static final String STATE_IMAGE_URI = "state_image_uri";
    private static final String STATE_PENDING_URI = "state_pending_uri";

    private ActivityLeaveRequestBinding binding;
    private SessionManager sessionManager;
    private String baseUrl;
    private String currentMode = "leave";
    private String fetchedCoordinates;
    private Uri pendingCameraUri;
    private Uri meterPhotoUri;

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

    private final ActivityResultLauncher<String> cameraPermissionLauncher = registerForActivityResult(
            new ActivityResultContracts.RequestPermission(),
            granted -> {
                if (granted) {
                    openCameraForMeterPhoto();
                } else {
                    Toast.makeText(this, R.string.camera_permission_required, Toast.LENGTH_SHORT).show();
                }
            }
    );

    private final ActivityResultLauncher<Uri> takeMeterPhotoLauncher = registerForActivityResult(
            new ActivityResultContracts.TakePicture(),
            success -> {
                if (success && pendingCameraUri != null) {
                    meterPhotoUri = pendingCameraUri;
                    bindMeterPhotoPreview();
                } else {
                    pendingCameraUri = null;
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
        restoreTransientState(savedInstanceState);
        binding.backButton.setOnClickListener(v -> finish());
        binding.confirmButton.setOnClickListener(v -> submitCurrentAction());
        binding.meterUploadHint.setOnClickListener(v -> ensureCameraPermissionAndOpen());
        binding.meterImagePreview.setOnClickListener(v -> ensureCameraPermissionAndOpen());

        binding.locationInputLayout.setEndIconOnClickListener(v -> ensureLocationPermissionAndFetch());

        loadLeaveStatus();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        outState.putString(STATE_METER_READING, getInput(binding.meterReadingInput));
        outState.putString(STATE_LOCATION_TEXT, getInput(binding.locationInput));
        outState.putString(STATE_COORDINATES, fetchedCoordinates);
        outState.putString(STATE_IMAGE_URI, meterPhotoUri != null ? meterPhotoUri.toString() : null);
        outState.putString(STATE_PENDING_URI, pendingCameraUri != null ? pendingCameraUri.toString() : null);
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
            applyFormState(true, true);
        } else if ("pending_join".equals(status)) {
            currentMode = "join";
            binding.statusText.setText(R.string.leave_status_pending_join);
            binding.confirmButton.setText(R.string.leave_confirm_join);
            applyFormState(true, true);
        } else {
            currentMode = "leave";
            binding.statusText.setText(R.string.leave_status_ready);
            binding.confirmButton.setText(R.string.leave_confirm_go);
            applyFormState(true, true);
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
        String fetchedLocation = buildLocationLabel(location);
        binding.locationInput.setText(fetchedLocation);
        binding.locationInput.setSelection(fetchedLocation.length());
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

    private void openCameraForMeterPhoto() {
        try {
            pendingCameraUri = createTempImageUri("leave_meter_");
            takeMeterPhotoLauncher.launch(pendingCameraUri);
        } catch (Exception exception) {
            Toast.makeText(this, R.string.unable_to_open_camera, Toast.LENGTH_SHORT).show();
        }
    }

    private void ensureCameraPermissionAndOpen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                && ActivityCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA);
            return;
        }

        openCameraForMeterPhoto();
    }

    private Uri createTempImageUri(String prefix) throws IOException {
        File mediaDir = new File(getFilesDir(), "trip-media");
        if (!mediaDir.exists() && !mediaDir.mkdirs()) {
            throw new IOException("Unable to create media directory");
        }

        File imageFile = File.createTempFile(prefix + System.currentTimeMillis(), ".jpg", mediaDir);
        return FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", imageFile);
    }

    private void submitCurrentAction() {
        String meterReading = getInput(binding.meterReadingInput);
        String locationText = getInput(binding.locationInput);
        if (TextUtils.isEmpty(meterReading)) {
            binding.meterReadingInput.setError(getString(R.string.leave_meter_required));
            return;
        }

        if (TextUtils.isEmpty(locationText)) {
            binding.locationInput.setError(getString(R.string.leave_location_required));
            return;
        }

        if (meterPhotoUri == null) {
            Toast.makeText(this, R.string.leave_meter_photo_required, Toast.LENGTH_SHORT).show();
            return;
        }

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

        Map<String, String> fields = new LinkedHashMap<>();
        setLoading(true);
        ContentResolver contentResolver = getContentResolver();
        if ("join".equals(currentMode)) {
            fields.put("join_meter_reading", meterReading);
            fields.put("join_location", locationText);
            fields.put("join_coordinates", fetchedCoordinates != null ? fetchedCoordinates : "");
            ApiClient.requestJoinAfterLeave(baseUrl, sessionManager.getToken(), fields, meterPhotoUri, contentResolver, callback);
        } else if ("leave".equals(currentMode)) {
            fields.put("leave_meter_reading", meterReading);
            fields.put("leave_location", locationText);
            fields.put("leave_coordinates", fetchedCoordinates != null ? fetchedCoordinates : "");
            ApiClient.requestLeave(baseUrl, sessionManager.getToken(), fields, meterPhotoUri, contentResolver, callback);
        }
    }

    private void setLoading(boolean loading) {
        binding.loadingOverlay.setVisibility(loading ? View.VISIBLE : View.GONE);
        boolean allowEditing = !loading;
        applyFormState(allowEditing, allowEditing);
    }

    private void applyFormState(boolean formEnabled, boolean allowEditing) {
        binding.confirmButton.setEnabled(formEnabled);
        binding.locationInputLayout.setEndIconVisible(formEnabled);
        binding.meterUploadHint.setEnabled(formEnabled);
        binding.meterImagePreview.setEnabled(formEnabled);
        updateEditableState(binding.meterReadingInput, allowEditing);
        updateEditableState(binding.locationInput, allowEditing);
    }

    private void updateEditableState(com.google.android.material.textfield.TextInputEditText input, boolean editable) {
        input.setEnabled(editable);
        input.setFocusable(editable);
        input.setFocusableInTouchMode(editable);
        input.setClickable(editable);
        input.setLongClickable(editable);
        input.setCursorVisible(editable);
    }

    private String getInput(com.google.android.material.textfield.TextInputEditText input) {
        return input.getText() != null ? input.getText().toString().trim() : "";
    }

    private void restoreTransientState(Bundle savedInstanceState) {
        if (savedInstanceState == null) {
            return;
        }

        binding.meterReadingInput.setText(savedInstanceState.getString(STATE_METER_READING, ""));
        binding.locationInput.setText(savedInstanceState.getString(STATE_LOCATION_TEXT, ""));
        if (binding.meterReadingInput.getText() != null) {
            binding.meterReadingInput.setSelection(binding.meterReadingInput.getText().length());
        }
        if (binding.locationInput.getText() != null) {
            binding.locationInput.setSelection(binding.locationInput.getText().length());
        }
        fetchedCoordinates = savedInstanceState.getString(STATE_COORDINATES);
        binding.coordinatesText.setText(fetchedCoordinates != null ? fetchedCoordinates : "");

        String meterUriValue = savedInstanceState.getString(STATE_IMAGE_URI);
        if (!TextUtils.isEmpty(meterUriValue)) {
            meterPhotoUri = Uri.parse(meterUriValue);
            bindMeterPhotoPreview();
        }

        String pendingUriValue = savedInstanceState.getString(STATE_PENDING_URI);
        if (!TextUtils.isEmpty(pendingUriValue)) {
            pendingCameraUri = Uri.parse(pendingUriValue);
        }
    }

    private void bindMeterPhotoPreview() {
        if (meterPhotoUri == null) {
            binding.meterImagePreview.setImageDrawable(null);
            binding.meterImagePreview.setVisibility(View.GONE);
            binding.meterUploadHint.setText(R.string.open_camera_for_leave_meter);
            return;
        }

        binding.meterImagePreview.setImageURI(meterPhotoUri);
        binding.meterImagePreview.setVisibility(View.VISIBLE);
        binding.meterUploadHint.setText(R.string.change_leave_meter_photo);
    }
}
