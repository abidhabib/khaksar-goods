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
import android.provider.MediaStore;
import android.text.TextUtils;
import android.view.LayoutInflater;
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

import com.example.ishaqcargo.databinding.ActivityEndTripBinding;
import com.example.ishaqcargo.network.ApiClient;
import com.example.ishaqcargo.util.AmountEntryDialogHelper;
import com.example.ishaqcargo.util.SessionManager;
import com.google.android.material.card.MaterialCardView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;

public class EndTripActivity extends AppCompatActivity {

    public static final String EXTRA_TRIP_ID = "trip_id";
    public static final String EXTRA_ROUTE = "trip_route";
    public static final String EXTRA_LOCKED_MODE = "locked_mode";
    public static final String EXTRA_START_METER = "start_meter";
    public static final String EXTRA_DESTINATION = "destination";

    private static final String PREF_NAME = "end_trip_drafts";

    private ActivityEndTripBinding binding;
    private SessionManager sessionManager;
    private String baseUrl;
    private Uri meterImageUri;
    private Uri pendingCameraUri;
    private String tripId;
    private String fetchedEndLocation;
    private Runnable endLocationTimeoutRunnable;
    private boolean lockedMode;
    private double tripStartMeter;
    private String tripDestination;
    private String selectedExpenseCategory;
    private final Map<String, Double> expenseTotals = new HashMap<>();

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
        binding = ActivityEndTripBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());
        WindowCompat.getInsetsController(getWindow(), binding.getRoot()).setAppearanceLightStatusBars(true);

        sessionManager = new SessionManager(this);
        baseUrl = sessionManager.getBaseUrl();
        tripId = getIntent().getStringExtra(EXTRA_TRIP_ID);
        lockedMode = getIntent().getBooleanExtra(EXTRA_LOCKED_MODE, false);
        tripStartMeter = getIntent().getDoubleExtra(EXTRA_START_METER, 0);
        tripDestination = getIntent().getStringExtra(EXTRA_DESTINATION);

        applyWindowInsets();
        bindStaticTripDetails();
        restoreDraft();
        setupExpenseWidgets();

        binding.backButton.setVisibility(lockedMode ? View.GONE : View.VISIBLE);
        binding.backButton.setOnClickListener(v -> {
            if (!lockedMode) {
                finish();
            }
        });
        binding.endMeterImagePreview.setOnClickListener(v -> openCameraForMeterPhoto());
        binding.endUploadHint.setOnClickListener(v -> openCameraForMeterPhoto());
        binding.fetchEndLocationButton.setOnClickListener(v -> ensureLocationPermissionAndFetch());
        binding.submitTripButton.setOnClickListener(v -> submitTrip());
        binding.expenseEditorCard.setVisibility(View.GONE);

        loadTripExpenseHistory();
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
        binding.routeSummary.setText(getIntent().getStringExtra(EXTRA_ROUTE));
        binding.tripDestinationValue.setText(TextUtils.isEmpty(tripDestination) ? "-" : tripDestination);

        String startMeterText = tripStartMeter > 0 ? String.format(Locale.US, "%.0f", tripStartMeter) : "-";
        binding.tripStartMeterValue.setText(getString(R.string.started_meter_value, startMeterText));

        if (tripStartMeter > 0 && TextUtils.isEmpty(getInput(binding.endMeterInput))) {
            binding.endMeterInput.setText(startMeterText);
            binding.endMeterInput.setSelection(startMeterText.length());
        }
    }

    private void setupExpenseWidgets() {
        bindExpenseCard(binding.dieselExpenseCard, "diesel", R.string.diesel_cost);
        bindExpenseCard(binding.tollExpenseCard, "toll", R.string.toll_cost);
        bindExpenseCard(binding.foodExpenseCard, "food", R.string.food_cost);
        bindExpenseCard(binding.policeExpenseCard, "police", R.string.police_cost);
        bindExpenseCard(binding.chalaanExpenseCard, "chalaan", R.string.chalaan_cost);
        bindExpenseCard(binding.rewardExpenseCard, "reward", R.string.reward_cost);
        bindExpenseCard(binding.tyrePunctureExpenseCard, "tyre_puncture", R.string.tyre_puncture_cost);
        styleWidgetCard(binding.dieselExpenseCard, R.color.trips_widget_bg, R.drawable.ic_widget_petrol_pump);
        styleWidgetCard(binding.tollExpenseCard, R.color.km_widget_bg, R.drawable.ic_widget_toll_plaza);
        styleWidgetCard(binding.foodExpenseCard, R.color.expenses_widget_bg, R.drawable.ic_widget_food_logo);
        styleWidgetCard(binding.policeExpenseCard, R.color.revenue_widget_bg, R.drawable.ic_widget_police);
        styleWidgetCard(binding.chalaanExpenseCard, R.color.button_primary, R.drawable.ic_widget_receipt);
        styleWidgetCard(binding.rewardExpenseCard, R.color.button_emerald_active, R.drawable.ic_widget_reward);
        styleWidgetCard(binding.tyrePunctureExpenseCard, R.color.button_amber, R.drawable.ic_widget_tyre);
    }

    private void bindExpenseCard(View card, String category, int titleRes) {
        card.setOnClickListener(v -> {
            selectedExpenseCategory = category;
            AmountEntryDialogHelper.show(
                    this,
                    getDialogIconRes(category),
                    getString(R.string.add_expense_for, getString(titleRes)),
                    "",
                    amount -> saveExpenseEntry(category, amount)
            );
        });
    }

    private void loadTripExpenseHistory() {
        if (TextUtils.isEmpty(tripId)) {
            return;
        }

        ApiClient.getTripDetails(baseUrl, sessionManager.getToken(), tripId, new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                runOnUiThread(() -> Toast.makeText(EndTripActivity.this, R.string.unable_to_load_trip_expenses, Toast.LENGTH_SHORT).show());
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String body = response.body() != null ? response.body().string() : "";

                if (!response.isSuccessful()) {
                    return;
                }

                try {
                    JSONObject root = new JSONObject(body);
                    JSONArray expenses = root.optJSONArray("expenses");
                    JSONObject trip = root.optJSONObject("trip");
                    runOnUiThread(() -> {
                        bindTripFromApi(trip);
                        renderExpenseHistory(expenses);
                    });
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
            if (TextUtils.isEmpty(getInput(binding.endMeterInput))) {
                binding.endMeterInput.setText(startMeterText);
            }
        }
    }

    private void renderExpenseHistory(JSONArray expenses) {
        binding.expenseHistoryContainer.removeAllViews();
        expenseTotals.clear();

        if (expenses == null || expenses.length() == 0) {
            binding.expenseHistoryEmpty.setVisibility(View.VISIBLE);
            updateExpenseSummaryCards();
            return;
        }

        binding.expenseHistoryEmpty.setVisibility(View.GONE);
        LayoutInflater inflater = LayoutInflater.from(this);

        for (int index = 0; index < expenses.length(); index++) {
            JSONObject expense = expenses.optJSONObject(index);
            if (expense == null) {
                continue;
            }

            String category = expense.optString("category", "");
            double amount = expense.optDouble("amount", 0);
            expenseTotals.put(category, expenseTotals.getOrDefault(category, 0d) + amount);

            View row = inflater.inflate(R.layout.item_trip_expense_entry, binding.expenseHistoryContainer, false);
            TextView title = row.findViewById(R.id.expenseEntryTitle);
            TextView amountView = row.findViewById(R.id.expenseEntryAmount);
            TextView timeView = row.findViewById(R.id.expenseEntryTime);

            title.setText(getExpenseLabel(category));
            amountView.setText(formatCurrency(amount));
            timeView.setText(formatTimestamp(expense.optString("created_at", "")));

            binding.expenseHistoryContainer.addView(row);
        }

        updateExpenseSummaryCards();
    }

    private void updateExpenseSummaryCards() {
        setExpenseValue(binding.dieselExpenseValue, "diesel");
        setExpenseValue(binding.tollExpenseValue, "toll");
        setExpenseValue(binding.foodExpenseValue, "food");
        setExpenseValue(binding.policeExpenseValue, "police");
        setExpenseValue(binding.chalaanExpenseValue, "chalaan");
        setExpenseValue(binding.rewardExpenseValue, "reward");
        setExpenseValue(binding.tyrePunctureExpenseValue, "tyre_puncture");
    }

    private void setExpenseValue(TextView textView, String category) {
        textView.setText(formatCurrency(expenseTotals.getOrDefault(category, 0d)));
    }

    private void saveExpenseEntry(String category, String amount) {
        if (TextUtils.isEmpty(tripId) || TextUtils.isEmpty(category)) {
            Toast.makeText(this, R.string.select_expense_type_first, Toast.LENGTH_SHORT).show();
            return;
        }

        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("category", category);
        fields.put("amount", amount);

        setSubmitting(true);

        ApiClient.addTripExpense(baseUrl, sessionManager.getToken(), tripId, fields, new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                runOnUiThread(() -> {
                    setSubmitting(false);
                    Toast.makeText(EndTripActivity.this, R.string.unable_to_save_expense, Toast.LENGTH_LONG).show();
                });
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String body = response.body() != null ? response.body().string() : "";
                if (!response.isSuccessful()) {
                    final String message = ApiClient.parseErrorMessage(body, getString(R.string.unable_to_save_expense));
                    runOnUiThread(() -> {
                        setSubmitting(false);
                        Toast.makeText(EndTripActivity.this, message, Toast.LENGTH_LONG).show();
                    });
                    return;
                }

                runOnUiThread(() -> {
                    setSubmitting(false);
                    saveDraft();
                    loadTripExpenseHistory();
                    Toast.makeText(EndTripActivity.this, R.string.expense_saved_successfully, Toast.LENGTH_SHORT).show();
                });
            }
        });
    }

    private void openCameraForMeterPhoto() {
        try {
            File imageFile = File.createTempFile(
                    "end_meter_" + System.currentTimeMillis(),
                    ".jpg",
                    getCacheDir()
            );
            pendingCameraUri = FileProvider.getUriForFile(
                    this,
                    getPackageName() + ".fileprovider",
                    imageFile
            );
            takeMeterPhotoLauncher.launch(pendingCameraUri);
        } catch (Exception exception) {
            Toast.makeText(this, R.string.unable_to_open_camera, Toast.LENGTH_SHORT).show();
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
                Toast.makeText(EndTripActivity.this, R.string.location_unavailable, Toast.LENGTH_SHORT).show();
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

        setSubmitting(true);

        ApiClient.endTrip(baseUrl, sessionManager.getToken(), tripId, fields, meterImageUri, getContentResolver(), new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                runOnUiThread(() -> {
                    setSubmitting(false);
                    Toast.makeText(EndTripActivity.this, R.string.unable_to_end_trip, Toast.LENGTH_LONG).show();
                });
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String body = response.body() != null ? response.body().string() : "";

                if (!response.isSuccessful()) {
                    String message = ApiClient.parseErrorMessage(body, getString(R.string.unable_to_end_trip));
                    runOnUiThread(() -> {
                        setSubmitting(false);
                        Toast.makeText(EndTripActivity.this, message, Toast.LENGTH_LONG).show();
                    });
                    return;
                }

                runOnUiThread(EndTripActivity.this::showSuccess);
            }
        });
    }

    private void showSuccess() {
        clearDraft();
        setSubmitting(false);
        binding.successState.setVisibility(View.VISIBLE);
        binding.submitTripButton.setVisibility(View.GONE);
        binding.formCard.setVisibility(View.GONE);
        binding.expenseEditorCard.setVisibility(View.GONE);
        binding.expenseHistoryCard.setVisibility(View.GONE);
        binding.successCloseButton.setOnClickListener(v -> {
            setResult(RESULT_OK);
            if (lockedMode) {
                Intent intent = new Intent(EndTripActivity.this, DriverDashboardActivity.class);
                intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
                finish();
            } else {
                finish();
            }
        });
    }

    private void setSubmitting(boolean submitting) {
        binding.loadingOverlay.setVisibility(submitting ? View.VISIBLE : View.GONE);
        binding.submitTripButton.setEnabled(!submitting);
        binding.saveExpenseButton.setEnabled(!submitting);
        binding.fetchEndLocationButton.setEnabled(!submitting);
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
                .remove(tripId + "_meter_image_uri")
                .apply();
    }

    private String getExpenseLabel(String category) {
        switch (category) {
            case "diesel":
                return getString(R.string.diesel_cost);
            case "toll":
                return getString(R.string.toll_cost);
            case "food":
                return getString(R.string.food_cost);
            case "police":
                return getString(R.string.police_cost);
            case "chalaan":
                return getString(R.string.chalaan_cost);
            case "reward":
                return getString(R.string.reward_cost);
            case "tyre_puncture":
                return getString(R.string.tyre_puncture_cost);
            default:
                return category;
        }
    }

    private int getDialogIconRes(String category) {
        switch (category) {
            case "diesel":
                return R.drawable.ic_widget_petrol_pump;
            case "toll":
                return R.drawable.ic_widget_toll_plaza;
            case "food":
                return R.drawable.ic_widget_food_logo;
            case "police":
                return R.drawable.ic_widget_police;
            case "chalaan":
                return R.drawable.ic_widget_receipt;
            case "reward":
                return R.drawable.ic_widget_reward;
            case "tyre_puncture":
                return R.drawable.ic_widget_tyre;
            default:
                return R.drawable.ic_cargo_diesel;
        }
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

    private String formatTimestamp(String rawValue) {
        if (TextUtils.isEmpty(rawValue) || "null".equalsIgnoreCase(rawValue)) {
            return "-";
        }

        try {
            Date parsed = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).parse(rawValue.replace('T', ' '));
            return new SimpleDateFormat("hh:mm a", Locale.US).format(parsed);
        } catch (ParseException ignored) {
            return rawValue.replace('T', ' ');
        }
    }

    private String getInput(com.google.android.material.textfield.TextInputEditText input) {
        return input.getText() != null ? input.getText().toString().trim() : "";
    }

    @Override
    public void onBackPressed() {
        if (lockedMode) {
            Toast.makeText(this, R.string.finish_trip_first, Toast.LENGTH_SHORT).show();
            return;
        }
        super.onBackPressed();
    }
}
