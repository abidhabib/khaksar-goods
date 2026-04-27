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
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.FileProvider;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.widget.ImageViewCompat;

import com.example.ishaqcargo.databinding.ActivityStartTripBinding;
import com.example.ishaqcargo.network.ApiClient;
import com.example.ishaqcargo.util.AmountEntryDialogHelper;
import com.example.ishaqcargo.util.SessionManager;
import com.google.android.material.card.MaterialCardView;

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

    private ActivityStartTripBinding binding;
    private SessionManager sessionManager;
    private Uri meterImageUri;
    private Uri biltySlipImageUri;
    private Uri loadPhotoUri;
    private Uri pendingMeterCameraUri;
    private Uri pendingBiltyCameraUri;
    private Uri pendingLoadCameraUri;
    private String baseUrl;
    private String fetchedStartLocation;
    private Runnable startLocationTimeoutRunnable;
    private String selectedAmountField;
    private String freightAmount = "";
    private String biltyCommissionAmount = "";

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

    private final ActivityResultLauncher<Uri> takeLoadPhotoLauncher = registerForActivityResult(
            new ActivityResultContracts.TakePicture(),
            success -> {
                if (success && pendingLoadCameraUri != null) {
                    loadPhotoUri = pendingLoadCameraUri;
                    bindLoadImagePreview();
                } else {
                    pendingLoadCameraUri = null;
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
        setupAmountWidgets();
        clearDraftState();

        binding.backButton.setOnClickListener(v -> finish());
        binding.startMeterImagePreview.setOnClickListener(v -> openCameraForMeterPhoto());
        binding.startUploadHint.setOnClickListener(v -> openCameraForMeterPhoto());
        binding.biltyImagePreview.setOnClickListener(v -> openCameraForBiltyPhoto());
        binding.biltyUploadHint.setOnClickListener(v -> openCameraForBiltyPhoto());
        binding.loadPhotoPreview.setOnClickListener(v -> openCameraForLoadPhoto());
        binding.loadUploadHint.setOnClickListener(v -> openCameraForLoadPhoto());
        binding.fetchStartLocationButton.setOnClickListener(v -> ensureLocationPermissionAndFetch());
        binding.submitTripButton.setOnClickListener(v -> submitTrip());
        ((View) binding.startToInput.getParent().getParent()).setVisibility(View.GONE);
        binding.amountEditorCard.setVisibility(View.GONE);
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

    private void setupAmountWidgets() {
        bindAmountCard(binding.freightChargeCard, "freight", R.string.freight_charge);
        bindAmountCard(binding.biltyCommissionCard, "bilty_commission", R.string.bilty_commission_amount);
        styleWidgetCard(binding.freightChargeCard, R.color.trips_widget_bg, R.drawable.ic_cargo_service);
        styleWidgetCard(binding.biltyCommissionCard, R.color.expenses_widget_bg, R.drawable.ic_cargo_toll);
        updateAmountCards();
    }

    private void bindAmountCard(View card, String field, int titleRes) {
        card.setOnClickListener(v -> {
            int iconRes = "freight".equals(field) ? R.drawable.ic_cargo_service : R.drawable.ic_cargo_toll;
            String initialAmount = "freight".equals(field) ? freightAmount : biltyCommissionAmount;
            AmountEntryDialogHelper.show(
                    this,
                    iconRes,
                    getString(R.string.add_expense_for, getString(titleRes)),
                    initialAmount,
                    amount -> {
                        if ("freight".equals(field)) {
                            freightAmount = amount;
                        } else {
                            biltyCommissionAmount = amount;
                        }
                        updateAmountCards();
                    }
            );
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

    private void updateAmountCards() {
        binding.freightChargeValue.setText(formatCurrency(parseDouble(freightAmount)));
        binding.biltyCommissionValue.setText(formatCurrency(parseDouble(biltyCommissionAmount)));
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

    private void openCameraForLoadPhoto() {
        try {
            pendingLoadCameraUri = createTempImageUri("load_photo_");
            takeLoadPhotoLauncher.launch(pendingLoadCameraUri);
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

    private void bindLoadImagePreview() {
        if (loadPhotoUri == null) {
            return;
        }
        binding.loadPhotoPreview.setImageURI(loadPhotoUri);
        binding.loadPhotoPreview.setVisibility(View.VISIBLE);
        binding.loadUploadHint.setText(R.string.load_change_photo);
    }

    private void submitTrip() {
        String from = getInput(binding.startFromInput);
        String meter = getInput(binding.startMeterInput);
        String loadName = getInput(binding.loadNameInput);
        String loadWeight = getInput(binding.loadWeightInput);
        String token = sessionManager.getToken();

        if (TextUtils.isEmpty(from)
                || TextUtils.isEmpty(meter)
                || TextUtils.isEmpty(freightAmount)
                || TextUtils.isEmpty(loadName)
                || TextUtils.isEmpty(loadWeight)) {
            Toast.makeText(this, R.string.fill_required_trip_fields, Toast.LENGTH_SHORT).show();
            return;
        }

        if (meterImageUri == null || biltySlipImageUri == null || loadPhotoUri == null) {
            Toast.makeText(this, R.string.trip_required_images, Toast.LENGTH_SHORT).show();
            return;
        }

        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("from_location", from);
        fields.put("freight_charge", freightAmount);
        fields.put("meter_reading", meter);
        fields.put("load_name", loadName);
        fields.put("load_weight", loadWeight);
        fields.put("bilty_commission_amount", TextUtils.isEmpty(biltyCommissionAmount) ? "0" : biltyCommissionAmount);
        fields.put("start_live_location", TextUtils.isEmpty(fetchedStartLocation) ? from : fetchedStartLocation);

        setSubmitting(true);

        ApiClient.startTrip(baseUrl, token, fields, meterImageUri, biltySlipImageUri, loadPhotoUri, getContentResolver(), new Callback() {
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
                runOnUiThread(() -> showSuccess(routeText, finalCreatedTripId, startMeterValue, from));
            }
        });
    }

    private void showSuccess(String routeText, String tripId, String startMeterValue, String destination) {
        clearDraftState();
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
                intent.putExtra(EndTripActivity.EXTRA_START_METER, parseDouble(startMeterValue));
                intent.putExtra(EndTripActivity.EXTRA_DESTINATION, destination);
                intent.putExtra(EndTripActivity.EXTRA_LOCKED_MODE, true);
                startActivity(intent);
            }
            finish();
        });
    }

    private void setSubmitting(boolean submitting) {
        binding.loadingOverlay.setVisibility(submitting ? View.VISIBLE : View.GONE);
        binding.submitTripButton.setEnabled(!submitting);
        binding.saveAmountButton.setEnabled(!submitting);
        binding.backButton.setEnabled(!submitting);
        binding.fetchStartLocationButton.setEnabled(!submitting);
    }

    private void clearDraftState() {
        freightAmount = "";
        biltyCommissionAmount = "";
        fetchedStartLocation = null;
        meterImageUri = null;
        biltySlipImageUri = null;
        loadPhotoUri = null;
        pendingMeterCameraUri = null;
        pendingBiltyCameraUri = null;
        pendingLoadCameraUri = null;
        updateAmountCards();
    }

    private void styleWidgetCard(MaterialCardView card, int colorRes, int iconRes) {
        int backgroundColor = ContextCompat.getColor(this, colorRes);
        int foregroundColor = ContextCompat.getColor(this, R.color.white);
        card.setCardBackgroundColor(backgroundColor);
        card.setStrokeColor(backgroundColor);
        card.setRadius(dpToPx(24));

        View child = card.getChildAt(0);
        if (child instanceof LinearLayout) {
            LinearLayout layout = (LinearLayout) child;
            for (int i = 0; i < layout.getChildCount(); i++) {
                View item = layout.getChildAt(i);
                if (item instanceof TextView) {
                    ((TextView) item).setTextColor(foregroundColor);
                } else if (item instanceof ImageView) {
                    ImageView imageView = (ImageView) item;
                    imageView.setImageResource(iconRes);
                    ImageViewCompat.setImageTintList(imageView, null);
                    imageView.setBackgroundResource(R.drawable.bg_widget_logo_badge);
                    imageView.setPadding(dpToPx(9), dpToPx(9), dpToPx(9), dpToPx(9));
                    imageView.setScaleType(ImageView.ScaleType.CENTER_INSIDE);

                    ViewGroup.LayoutParams params = imageView.getLayoutParams();
                    params.width = dpToPx(42);
                    params.height = dpToPx(42);
                    imageView.setLayoutParams(params);
                }
            }
        }
    }

    private int dpToPx(int dp) {
        return Math.round(dp * getResources().getDisplayMetrics().density);
    }

    private String formatCurrency(double amount) {
        return String.format(Locale.US, "Rs %.0f", amount);
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
