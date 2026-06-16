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
import android.os.Looper;
import android.text.TextUtils;
import android.view.View;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
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

import java.io.IOException;
import java.util.ArrayList;
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

    private ActivityEndTripBinding binding;
    private SessionManager sessionManager;
    private String baseUrl;
    private String tripId;
    private boolean lockedMode;
    private double tripStartMeter;
    private String tripDestination;
    private final Map<String, Double> expenseTotals = new HashMap<>();
    private Map<String, String> pendingExpenseFields;
    private Runnable locationTimeoutRunnable;

    private final ActivityResultLauncher<String[]> locationPermissionLauncher = registerForActivityResult(
            new ActivityResultContracts.RequestMultiplePermissions(),
            result -> {
                boolean granted = Boolean.TRUE.equals(result.get(Manifest.permission.ACCESS_FINE_LOCATION))
                        || Boolean.TRUE.equals(result.get(Manifest.permission.ACCESS_COARSE_LOCATION));

                if (granted) {
                    fetchCurrentLocationForPendingExpense();
                    return;
                }

                Toast.makeText(this, R.string.location_permission_required, Toast.LENGTH_SHORT).show();
                proceedWithPendingExpenseSubmission();
            }
    );

    private final ActivityResultLauncher<Intent> dieselExpenseLauncher = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            result -> {
                if (result.getResultCode() == RESULT_OK) {
                    loadTripExpenseHistory();
                }
            }
    );

    private final ActivityResultLauncher<Intent> receiptExpenseLauncher = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            result -> {
                if (result.getResultCode() == RESULT_OK) {
                    loadTripExpenseHistory();
                }
            }
    );

    private final ActivityResultLauncher<Intent> tollExpenseLauncher = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            result -> {
                if (result.getResultCode() == RESULT_OK) {
                    loadTripExpenseHistory();
                }
            }
    );

    private final ActivityResultLauncher<Intent> endTripDetailsLauncher = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            result -> {
                if (result.getResultCode() == RESULT_OK) {
                    setResult(RESULT_OK);
                    if (lockedMode) {
                        Intent intent = new Intent(this, DriverDashboardActivity.class);
                        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                        startActivity(intent);
                    }
                    finish();
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
        setupExpenseWidgets();


        binding.submitTripButton.setOnClickListener(v -> openEndTripDetails());

        loadTripExpenseHistory();
    }

    @Override
    protected void onPause() {
        super.onPause();
        clearLocationTimeout();
    }

    private void applyWindowInsets() {
        final int formBottomPadding = binding.formScroll.getPaddingBottom();
        ViewCompat.setOnApplyWindowInsetsListener(binding.getRoot(), (view, windowInsets) -> {
            Insets insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());

            binding.formScroll.setPadding(
                    binding.formScroll.getPaddingLeft(),
                    binding.formScroll.getPaddingTop(),
                    binding.formScroll.getPaddingRight(),
                    formBottomPadding + insets.bottom + getResources().getDimensionPixelSize(R.dimen.dashboard_bottom_padding)
            );
            return windowInsets;
        });
    }



    private void setupExpenseWidgets() {
        binding.dieselExpenseCard.setOnClickListener(v -> openDieselExpenseScreen());
        binding.tollExpenseCard.setOnClickListener(v -> openTollExpenseScreen());
        bindSimpleExpenseCard(binding.foodExpenseCard, "food", R.string.food_cost);
        bindSimpleExpenseCard(binding.policeExpenseCard, "police", R.string.police_cost);
        binding.chalaanExpenseCard.setOnClickListener(v -> openReceiptExpenseScreen("chalaan", getString(R.string.chalaan_cost)));
        bindSimpleExpenseCard(binding.mandiKaatExpenseCard, "mandi_kaat", R.string.mandi_kaat_cost);
        bindSimpleExpenseCard(binding.rewardExpenseCard, "reward", R.string.reward_cost);
        binding.tyrePunctureExpenseCard.setOnClickListener(v -> openReceiptExpenseScreen("tyre_puncture", getString(R.string.tyre_puncture_cost)));

        styleWidgetCard(binding.dieselExpenseCard, R.color.trips_widget_bg, R.drawable.ic_cargo_diesel);
        styleWidgetCard(binding.tollExpenseCard, R.color.trips_widget_bg, R.drawable.ic_cargo_toll);
        styleWidgetCard(binding.foodExpenseCard, R.color.trips_widget_bg, R.drawable.ic_cargo_food);
        styleWidgetCard(binding.policeExpenseCard, R.color.trips_widget_bg, R.drawable.ic_cargo_guard);
        styleWidgetCard(binding.chalaanExpenseCard, R.color.trips_widget_bg, R.drawable.ic_cargo_service);
        styleWidgetCard(binding.mandiKaatExpenseCard, R.color.trips_widget_bg, R.drawable.ic_cargo_service);
        styleWidgetCard(binding.rewardExpenseCard, R.color.trips_widget_bg, R.drawable.ic_cargo_mobile);
        styleWidgetCard(binding.tyrePunctureExpenseCard, R.color.trips_widget_bg, R.drawable.ic_cargo_mechanic);
    }

    private void bindSimpleExpenseCard(View card, String category, int titleRes) {
        card.setOnClickListener(v -> AmountEntryDialogHelper.show(
                this,
                getDialogIconRes(category),
                getString(titleRes),
                "",
                amount -> saveExpenseEntry(category, amount)
        ));
    }

    private void openDieselExpenseScreen() {
        Intent intent = new Intent(this, DieselExpenseActivity.class);
        intent.putExtra(EXTRA_TRIP_ID, tripId);
        dieselExpenseLauncher.launch(intent);
    }

    private void openTollExpenseScreen() {
        Intent intent = new Intent(this, TollExpenseActivity.class);
        intent.putExtra(EXTRA_TRIP_ID, tripId);
        tollExpenseLauncher.launch(intent);
    }

    private void openReceiptExpenseScreen(String expenseCategory, String title) {
        Intent intent = new Intent(this, ReceiptExpenseActivity.class);
        intent.putExtra(ReceiptExpenseActivity.EXTRA_TRIP_ID, tripId);
        intent.putExtra(ReceiptExpenseActivity.EXTRA_CATEGORY, expenseCategory);
        intent.putExtra(ReceiptExpenseActivity.EXTRA_TITLE, title);
        intent.putExtra(ReceiptExpenseActivity.EXTRA_SAVE_LABEL, getString(R.string.save_expense_entry));
        intent.putExtra(ReceiptExpenseActivity.EXTRA_UPLOAD_LABEL, getString(R.string.add_photo));
        intent.putExtra(ReceiptExpenseActivity.EXTRA_CHANGE_LABEL, getString(R.string.start_trip_change_photo));
        intent.putExtra(ReceiptExpenseActivity.EXTRA_PHOTO_REQUIRED_MESSAGE, getString(R.string.load_photo_only_required));
        receiptExpenseLauncher.launch(intent);
    }

    private void openEndTripDetails() {
        Intent intent = new Intent(this, EndTripDetailsActivity.class);
        intent.putExtra(EXTRA_TRIP_ID, tripId);
        intent.putExtra(EXTRA_ROUTE, getIntent().getStringExtra(EXTRA_ROUTE));
        intent.putExtra(EXTRA_START_METER, tripStartMeter);
        intent.putExtra(EXTRA_DESTINATION, tripDestination);
        intent.putExtra(EXTRA_LOCKED_MODE, lockedMode);
        endTripDetailsLauncher.launch(intent);
    }

    private void loadTripExpenseHistory() {
        if (TextUtils.isEmpty(tripId)) {
            return;
        }

        setSubmitting(true);
        ApiClient.getTripDetails(baseUrl, sessionManager.getToken(), tripId, new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                runOnUiThread(() -> {
                    setSubmitting(false);
                    Toast.makeText(EndTripActivity.this, R.string.unable_to_load_trip_expenses, Toast.LENGTH_SHORT).show();
                });
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String body = response.body() != null ? response.body().string() : "";

                if (!response.isSuccessful()) {
                    runOnUiThread(() -> setSubmitting(false));
                    return;
                }

                try {
                    JSONObject root = new JSONObject(body);
                    JSONArray expenses = root.optJSONArray("expenses");
                    JSONObject trip = root.optJSONObject("trip");
                    runOnUiThread(() -> {
                        bindTripFromApi(trip);
                        setSubmitting(false);
                    });
                } catch (Exception ignored) {
                    runOnUiThread(() -> setSubmitting(false));
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
        }

        double startMeter = trip.optDouble("start_meter_reading", tripStartMeter);
        if (startMeter > 0) {
            tripStartMeter = startMeter;
        }
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

        pendingExpenseFields = new LinkedHashMap<>(fields);
        setSubmitting(true);
        ensureLocationPermissionAndSubmit();
    }

    private void saveExpenseEntryDirect(Map<String, String> fields) {
        ApiClient.addTripExpense(baseUrl, sessionManager.getToken(), tripId, fields, null, null, new Callback() {
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
                    loadTripExpenseHistory();
                    Toast.makeText(EndTripActivity.this, R.string.expense_saved_successfully, Toast.LENGTH_SHORT).show();
                });
            }
        });
    }

    private void ensureLocationPermissionAndSubmit() {
        boolean fineGranted = ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean coarseGranted = ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;

        if (fineGranted || coarseGranted) {
            fetchCurrentLocationForPendingExpense();
            return;
        }

        locationPermissionLauncher.launch(new String[]{
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
        });
    }

    private void fetchCurrentLocationForPendingExpense() {
        LocationManager locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
        if (locationManager == null) {
            proceedWithPendingExpenseSubmission();
            return;
        }

        String provider = locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)
                ? LocationManager.GPS_PROVIDER
                : locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
                ? LocationManager.NETWORK_PROVIDER
                : null;

        if (provider == null) {
            Toast.makeText(this, R.string.enable_location_services, Toast.LENGTH_SHORT).show();
            proceedWithPendingExpenseSubmission();
            return;
        }

        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
                && ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            proceedWithPendingExpenseSubmission();
            return;
        }

        Location cachedLocation = getBestLastKnownLocation(locationManager);
        if (cachedLocation != null) {
            saveCurrentLocationForExpense(cachedLocation);
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            locationManager.getCurrentLocation(provider, null, getMainExecutor(), this::saveCurrentLocationForExpense);
        } else {
            requestSingleLocationUpdate(locationManager, provider);
        }
    }

    private Location getBestLastKnownLocation(LocationManager locationManager) {
        Location bestLocation = null;
        List<String> providers = locationManager.getProviders(true);
        if (providers == null) {
            return null;
        }

        for (String provider : providers) {
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
                    saveCurrentLocationForExpense(location);
                }
            };

            locationManager.requestLocationUpdates(provider, 0L, 0f, listener, Looper.getMainLooper());
            clearLocationTimeout();
            locationTimeoutRunnable = () -> {
                try {
                    locationManager.removeUpdates(listener);
                } catch (Exception ignored) {
                }
                proceedWithPendingExpenseSubmission();
            };
            binding.loadingOverlay.postDelayed(locationTimeoutRunnable, 8000L);
        } catch (Exception ignored) {
            clearLocationTimeout();
            proceedWithPendingExpenseSubmission();
        }
    }

    private void clearLocationTimeout() {
        if (locationTimeoutRunnable != null) {
            binding.loadingOverlay.removeCallbacks(locationTimeoutRunnable);
            locationTimeoutRunnable = null;
        }
    }

    private void saveCurrentLocationForExpense(Location location) {
        clearLocationTimeout();
        if (location == null) {
            proceedWithPendingExpenseSubmission();
            return;
        }

        Map<String, String> fields = buildLocationFields(location);
        ApiClient.saveCurrentLocation(baseUrl, sessionManager.getToken(), fields, new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                runOnUiThread(EndTripActivity.this::proceedWithPendingExpenseSubmission);
            }

            @Override
            public void onResponse(Call call, Response response) {
                response.close();
                runOnUiThread(EndTripActivity.this::proceedWithPendingExpenseSubmission);
            }
        });
    }

    private Map<String, String> buildLocationFields(Location location) {
        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("latitude", String.format(Locale.US, "%.7f", location.getLatitude()));
        fields.put("longitude", String.format(Locale.US, "%.7f", location.getLongitude()));
        fields.put("source", "driver_app_trip_expense");
        fields.put("trip_id", tripId);

        Address address = resolveAddress(location);
        if (address != null) {
            String area = firstNonEmpty(address.getSubLocality(), address.getLocality(), address.getSubAdminArea());
            String city = firstNonEmpty(address.getLocality(), address.getSubAdminArea(), area);
            String province = firstNonEmpty(address.getAdminArea(), address.getCountryName());
            String addressLabel = buildAddressLabel(address, area, city, province);

            putIfNotEmpty(fields, "area", area);
            putIfNotEmpty(fields, "city", city);
            putIfNotEmpty(fields, "province", province);
            putIfNotEmpty(fields, "address_label", addressLabel);
        }

        return fields;
    }

    private Address resolveAddress(Location location) {
        try {
            Geocoder geocoder = new Geocoder(this, Locale.getDefault());
            List<Address> addresses = geocoder.getFromLocation(location.getLatitude(), location.getLongitude(), 1);
            if (addresses == null || addresses.isEmpty()) {
                return null;
            }
            return addresses.get(0);
        } catch (IOException | IllegalArgumentException ignored) {
            return null;
        }
    }

    private String buildAddressLabel(Address address, String area, String city, String province) {
        if (address == null) {
            return joinNonEmpty(area, city, province);
        }

        return joinNonEmpty(
                address.getFeatureName(),
                address.getThoroughfare(),
                address.getSubLocality(),
                address.getLocality(),
                address.getAdminArea()
        );
    }

    private String firstNonEmpty(String... values) {
        if (values == null) {
            return "";
        }

        for (String value : values) {
            if (!TextUtils.isEmpty(value)) {
                return value.trim();
            }
        }
        return "";
    }

    private String joinNonEmpty(String... values) {
        List<String> parts = new ArrayList<>();
        if (values != null) {
            for (String value : values) {
                if (!TextUtils.isEmpty(value)) {
                    String trimmed = value.trim();
                    if (!trimmed.isEmpty() && !parts.contains(trimmed)) {
                        parts.add(trimmed);
                    }
                }
            }
        }
        return TextUtils.join(", ", parts);
    }

    private void putIfNotEmpty(Map<String, String> fields, String key, String value) {
        if (!TextUtils.isEmpty(value)) {
            fields.put(key, value.trim());
        }
    }

    private void proceedWithPendingExpenseSubmission() {
        Map<String, String> fields = pendingExpenseFields;
        pendingExpenseFields = null;

        if (fields == null || fields.isEmpty()) {
            setSubmitting(false);
            return;
        }

        saveExpenseEntryDirect(fields);
    }

    private void setSubmitting(boolean submitting) {
        binding.loadingOverlay.setVisibility(submitting ? View.VISIBLE : View.GONE);
        binding.submitTripButton.setEnabled(!submitting);
        setCardEnabled(binding.dieselExpenseCard, !submitting);
        setCardEnabled(binding.tollExpenseCard, !submitting);
        setCardEnabled(binding.foodExpenseCard, !submitting);
        setCardEnabled(binding.policeExpenseCard, !submitting);
        setCardEnabled(binding.chalaanExpenseCard, !submitting);
        setCardEnabled(binding.mandiKaatExpenseCard, !submitting);
        setCardEnabled(binding.rewardExpenseCard, !submitting);
        setCardEnabled(binding.tyrePunctureExpenseCard, !submitting);
    }

    private void setCardEnabled(View card, boolean enabled) {
        card.setEnabled(enabled);
        card.setAlpha(enabled ? 1f : 0.6f);
    }

    private int getDialogIconRes(String category) {
        switch (category) {
            case "toll":
                return R.drawable.ic_cargo_toll;
            case "food":
                return R.drawable.ic_cargo_food;
            case "police":
                return R.drawable.ic_cargo_guard;
            case "chalaan":
            case "mandi_kaat":
                return R.drawable.ic_cargo_service;
            case "reward":
                return R.drawable.ic_cargo_mobile;
            case "tyre_puncture":
                return R.drawable.ic_cargo_mechanic;
            case "diesel":
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
        if (child instanceof android.widget.LinearLayout) {
            android.widget.LinearLayout layout = (android.widget.LinearLayout) child;
            for (int i = 0; i < layout.getChildCount(); i++) {
                View item = layout.getChildAt(i);
                if (item instanceof TextView) {
                    ((TextView) item).setTextColor(foregroundColor);
                } else if (item instanceof android.widget.ImageView) {
                    android.widget.ImageView imageView = (android.widget.ImageView) item;
                    imageView.setImageResource(iconRes);
                    ImageViewCompat.setImageTintList(imageView, null);
                    imageView.setBackgroundResource(R.drawable.bg_widget_logo_badge);
                    imageView.setPadding(dpToPx(9), dpToPx(9), dpToPx(9), dpToPx(9));
                    imageView.setScaleType(android.widget.ImageView.ScaleType.CENTER_INSIDE);

                    android.view.ViewGroup.LayoutParams params = imageView.getLayoutParams();
                    params.width = dpToPx(42);
                    params.height = dpToPx(42);
                    imageView.setLayoutParams(params);
                } else if (item instanceof android.widget.LinearLayout) {
                    android.widget.LinearLayout textContainer = (android.widget.LinearLayout) item;
                    for (int j = 0; j < textContainer.getChildCount(); j++) {
                        View nested = textContainer.getChildAt(j);
                        if (nested instanceof TextView) {
                            ((TextView) nested).setTextColor(foregroundColor);
                        }
                    }
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

    @Override
    public void onBackPressed() {
        if (lockedMode) {
            Toast.makeText(this, R.string.finish_trip_first, Toast.LENGTH_SHORT).show();
            return;
        }
        super.onBackPressed();
    }
}
