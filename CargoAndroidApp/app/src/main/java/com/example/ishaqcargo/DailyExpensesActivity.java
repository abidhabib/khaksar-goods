package com.example.ishaqcargo;

import android.app.Dialog;
import android.Manifest;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
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
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.widget.ImageViewCompat;

import com.example.ishaqcargo.databinding.ActivityDailyExpensesBinding;
import com.example.ishaqcargo.network.ApiClient;
import com.example.ishaqcargo.util.AmountEntryDialogHelper;
import com.example.ishaqcargo.util.SessionManager;
import com.google.android.material.card.MaterialCardView;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.google.android.material.textfield.TextInputEditText;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;

public class DailyExpensesActivity extends AppCompatActivity {

    private static final String PREF_NAME = "daily_expense_draft";

    private ActivityDailyExpensesBinding binding;
    private SessionManager sessionManager;
    private String baseUrl;
    private String selectedCategory;
    private Uri selectedImageUri;
    private String pendingAmount;
    private String pendingNote;
    private Map<String, String> pendingSubmissionFields;
    private Uri pendingSubmissionImageUri;
    private Runnable locationTimeoutRunnable;

    private ActivityResultLauncher<Intent> imagePickerLauncher;
    private Dialog pendingDialog;
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

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        binding = ActivityDailyExpensesBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());
        WindowCompat.getInsetsController(getWindow(), binding.getRoot()).setAppearanceLightStatusBars(true);

        sessionManager = new SessionManager(this);
        baseUrl = sessionManager.getBaseUrl();

       imagePickerLauncher = registerForActivityResult(
        new ActivityResultContracts.StartActivityForResult(),
        result -> {
            if (result.getResultCode() == RESULT_OK) {
                Intent data = result.getData();
                if (data != null && data.getData() != null) {
                    selectedImageUri = data.getData();
                } else if (data != null && data.getExtras() != null && data.getExtras().get("data") instanceof Bitmap) {
                    Bitmap thumbnail = (Bitmap) data.getExtras().get("data");
                    selectedImageUri = saveBitmapToCache(thumbnail);
                }
                
                if (pendingDialog != null && pendingDialog.isShowing()) {
                    updateImagePreviewInDialog(pendingDialog);
                } else {
                    updateImagePreviewInDialog(null);
                }
            } else if ("other".equals(selectedCategory) && (pendingDialog == null || !pendingDialog.isShowing())) {
                showOtherExpenseDialog();
            }
        }
);

        applyWindowInsets();
        setupExpenseWidgets();
        restoreDraft();

        binding.backButton.setOnClickListener(v -> finish());
        binding.expenseEditorCard.setVisibility(View.GONE);

        loadTodaySummary();
    }

    @Override
    protected void onPause() {
        super.onPause();
        clearLocationTimeout();
        saveDraft();
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

    private void setupExpenseWidgets() {
        bindExpenseCard(binding.cargoServiceCard, "cargo_service", R.string.cargo_service_cost, true);
        bindExpenseCard(binding.mobileCostCard, "mobile", R.string.mobile_cost, false);
        bindMoboilExpenseCard();
        bindExpenseCard(binding.vehicleMaintenanceCard, "vehicle_maintenance", R.string.vehicle_maintenance_cost, true);
        bindExpenseCard(binding.mechanicCostCard, "mechanic", R.string.mechanic_cost, false);
        bindExpenseCard(binding.medicalCostCard, "medical", R.string.medical_cost, false);
        bindExpenseCard(binding.foodCostCard, "food", R.string.food_cost, false);
        bindExpenseCard(binding.securityGuardFeeCard, "cargo_security_guard", R.string.security_guard_fee, false);
        bindOtherExpenseCard();

        styleWidgetCard(binding.cargoServiceCard, R.color.trips_widget_bg, R.drawable.ic_cargo_service);
        styleWidgetCard(binding.mobileCostCard, R.color.trips_widget_bg, R.drawable.ic_cargo_mobile);
        styleWidgetCard(binding.moboilChangeCard, R.color.trips_widget_bg, R.drawable.ic_cargo_moboil);
        styleWidgetCard(binding.vehicleMaintenanceCard, R.color.trips_widget_bg, R.drawable.ic_cargo_mechanic);
        styleWidgetCard(binding.mechanicCostCard, R.color.trips_widget_bg, R.drawable.ic_cargo_mechanic);
        styleWidgetCard(binding.medicalCostCard, R.color.trips_widget_bg, android.R.drawable.ic_menu_info_details);
        styleWidgetCard(binding.foodCostCard, R.color.trips_widget_bg, R.drawable.ic_cargo_food);
        styleWidgetCard(binding.securityGuardFeeCard, R.color.trips_widget_bg, R.drawable.ic_cargo_guard);
        styleWidgetCard(binding.otherExpenseCard, R.color.trips_widget_bg, android.R.drawable.ic_menu_add);
    }

    private void resetSelection() {
        selectedCategory = null;
        selectedImageUri = null;
        pendingAmount = null;
        pendingNote = null;
        pendingDialog = null;
    }

    private void bindExpenseCard(View card, String category, int titleRes, boolean supportsImage) {
        card.setOnClickListener(v -> {
            resetSelection();
            selectedCategory = category;
            if (supportsImage) {
                showStandardExpenseDialog(getString(titleRes), getDialogIconRes(category));
            } else {
                AmountEntryDialogHelper.show(
                        this,
                        getDialogIconRes(category),
                        getString(titleRes),
                        "",
                        amount -> saveDailyExpense(category, amount)
                );
            }
        });
    }

    private void showStandardExpenseDialog(String title, int iconRes) {
        View view = LayoutInflater.from(this).inflate(R.layout.dialog_standard_expense, null, false);
        ImageView iconView = view.findViewById(R.id.dialogIcon);
        TextView titleView = view.findViewById(R.id.dialogTitle);
        TextInputEditText amountInput = view.findViewById(R.id.dialogAmountInput);
        ImageView photoPreview = view.findViewById(R.id.dialogPhotoPreview);
        View addPhotoButton = view.findViewById(R.id.dialogAddPhotoButton);

        iconView.setImageResource(iconRes);
        titleView.setText(title);

        if (!TextUtils.isEmpty(pendingAmount)) {
            amountInput.setText(pendingAmount);
        }

        if (selectedImageUri != null) {
            photoPreview.setVisibility(View.VISIBLE);
            photoPreview.setImageURI(selectedImageUri);
        }

        Dialog dialog = new MaterialAlertDialogBuilder(this)
                .setView(view)
                .setNegativeButton(R.string.close, null)
                .setPositiveButton(R.string.save_amount, null)
                .create();

        dialog.setOnShowListener(ignored -> {
            android.widget.Button positiveButton = dialog.findViewById(android.R.id.button1);
            if (positiveButton != null) {
                positiveButton.setOnClickListener(v -> {
                    String amount = getInput(amountInput);
                    if (TextUtils.isEmpty(amount)) {
                        amountInput.setError(getString(R.string.enter_expense_amount));
                        return;
                    }

                    Map<String, String> fields = new LinkedHashMap<>();
                    fields.put("category", selectedCategory);
                    fields.put("amount", amount);

                    if (selectedImageUri != null) {
                        saveDailyExpenseWithImage(fields, selectedImageUri);
                    } else {
                        saveDailyExpense(fields);
                    }
                    dialog.dismiss();
                });
            }

            addPhotoButton.setOnClickListener(v -> {
                pendingAmount = getInput(amountInput);
                pendingDialog = dialog;
                openCamera();
            });
        });

        dialog.show();
    }

    private void bindOtherExpenseCard() {
        binding.otherExpenseCard.setOnClickListener(v -> {
            resetSelection();
            showOtherExpenseDialog();
        });
    }

    private void bindMoboilExpenseCard() {
        binding.moboilChangeCard.setOnClickListener(v -> {
            resetSelection();
            showMoboilDialog();
        });
    }

    private void showImagePickerDialog(String category, String amount) {
        selectedImageUri = null;
        new MaterialAlertDialogBuilder(this)
                .setTitle(getExpenseLabel(category))
                .setMessage(R.string.add_expense_photo_optional)
                .setNegativeButton(R.string.skip, (dialog, which) -> {
                    saveDailyExpense(category, amount);
                })
                .setPositiveButton(R.string.add_photo, (dialog, which) -> {
                    pendingDialog = null;
                    openCamera();
                })
                .setNeutralButton(R.string.save_without_photo, (dialog, which) -> {
                    saveDailyExpense(category, amount);
                })
                .show();
    }

    private void openCamera() {
        Intent cameraIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        if (cameraIntent.resolveActivity(getPackageManager()) != null) {
            imagePickerLauncher.launch(cameraIntent);
        } else {
            Toast.makeText(this, "Camera not available", Toast.LENGTH_SHORT).show();
        }
    }

    private void openGallery() {
        Intent galleryIntent = new Intent(Intent.ACTION_PICK, MediaStore.Images.Media.EXTERNAL_CONTENT_URI);
        galleryIntent.setDataAndType(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, "image/*");
        imagePickerLauncher.launch(galleryIntent);
    }

    private void updateImagePreviewInDialog(Dialog dialog) {
        if (selectedCategory == null || selectedImageUri == null) return;

        if (dialog != null && dialog.isShowing()) {
            ImageView photoPreview = dialog.findViewById(R.id.dialogPhotoPreview);
            if (photoPreview != null) {
                photoPreview.setVisibility(View.VISIBLE);
                photoPreview.setImageURI(selectedImageUri);
            }
        } else {
            if ("other".equals(selectedCategory)) {
                showOtherExpenseDialog();
            } else if ("cargo_service".equals(selectedCategory) || "vehicle_maintenance".equals(selectedCategory)) {
                showStandardExpenseDialog(getExpenseLabel(selectedCategory), getDialogIconRes(selectedCategory));
            }
        }
    }

    private void showOtherExpenseDialog() {
        selectedCategory = "other";

        View view = LayoutInflater.from(this).inflate(R.layout.dialog_other_expense, null, false);
        TextInputEditText amountInput = view.findViewById(R.id.dialogAmountInput);
        TextInputEditText noteInput = view.findViewById(R.id.dialogNoteInput);
        ImageView photoPreview = view.findViewById(R.id.dialogPhotoPreview);
        View addPhotoButton = view.findViewById(R.id.dialogAddPhotoButton);

        if (!TextUtils.isEmpty(pendingAmount)) {
            amountInput.setText(pendingAmount);
        }
        if (!TextUtils.isEmpty(pendingNote)) {
            noteInput.setText(pendingNote);
        }

        if (selectedImageUri != null) {
            photoPreview.setVisibility(View.VISIBLE);
            photoPreview.setImageURI(selectedImageUri);
        }

        Dialog dialog = new MaterialAlertDialogBuilder(this)
                .setTitle(R.string.other_cost)
                .setView(view)
                .setNegativeButton(R.string.close, null)
                .setPositiveButton(R.string.save_expense_entry, null)
                .create();

        dialog.setOnShowListener(ignored -> {
            android.widget.Button positiveButton = dialog.findViewById(android.R.id.button1);
            if (positiveButton != null) {
                positiveButton.setOnClickListener(v -> {
                    String amount = getInput(amountInput);
                    String note = getInput(noteInput);

                    if (TextUtils.isEmpty(amount)) {
                        amountInput.setError(getString(R.string.enter_expense_amount));
                        return;
                    }

                    Map<String, String> fields = new LinkedHashMap<>();
                    fields.put("category", "other");
                    fields.put("amount", amount);
                    if (!TextUtils.isEmpty(note)) {
                        fields.put("note", note);
                    }

                    if (selectedImageUri != null) {
                        saveDailyExpenseWithImage(fields, selectedImageUri);
                    } else {
                        saveDailyExpense(fields);
                    }
                    dialog.dismiss();
                });
            }

            addPhotoButton.setOnClickListener(v -> {
                pendingAmount = getInput(amountInput);
                pendingNote = getInput(noteInput);
                pendingDialog = dialog;
                openCamera();
            });
        });

        dialog.show();
    }

    private void loadTodaySummary() {
        String month = new SimpleDateFormat("yyyy-MM", Locale.US).format(new Date());
        setLoading(true);

        ApiClient.getDailyExpenses(baseUrl, sessionManager.getToken(), month, new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                runOnUiThread(() -> {
                    setLoading(false);
                    Toast.makeText(DailyExpensesActivity.this, R.string.unable_to_load_daily_expenses, Toast.LENGTH_LONG).show();
                });
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String body = response.body() != null ? response.body().string() : "";
                if (!response.isSuccessful()) {
                    final String message = ApiClient.parseErrorMessage(body, getString(R.string.unable_to_load_daily_expenses));
                    runOnUiThread(() -> {
                        setLoading(false);
                        Toast.makeText(DailyExpensesActivity.this, message, Toast.LENGTH_LONG).show();
                    });
                    return;
                }

                try {
                    JSONObject root = new JSONObject(body);
                    JSONArray entries = root.optJSONArray("entries");
                    JSONObject todayExpense = buildTodayExpenseFromEntries(entries);
                    runOnUiThread(() -> {
                        bindTodaySummary(todayExpense);
                        setLoading(false);
                    });
                } catch (Exception exception) {
                    runOnUiThread(() -> {
                        setLoading(false);
                        Toast.makeText(DailyExpensesActivity.this, R.string.invalid_daily_expense_response, Toast.LENGTH_LONG).show();
                    });
                }
            }
        });
    }

    private JSONObject buildTodayExpenseFromEntries(JSONArray entries) {
        JSONObject totals = new JSONObject();
        try {
            totals.put("cargo_service_cost", 0);
            totals.put("mobile_cost", 0);
            totals.put("moboil_change_cost", 0);
            totals.put("vehicle_maintenance_cost", 0);
            totals.put("mechanic_cost", 0);
            totals.put("medical_cost", 0);
            totals.put("food_cost", 0);
            totals.put("cargo_security_guard_fee", 0);
            totals.put("other_cost", 0);
            totals.put("total_amount", 0);
        } catch (Exception ignored) {
        }

        if (entries == null || entries.length() == 0) {
            return totals;
        }

        String localToday = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        String targetDate = null;

        for (int i = 0; i < entries.length(); i++) {
            JSONObject entry = entries.optJSONObject(i);
            if (entry == null) continue;

            String entryDate = normalizeDate(entry.optString("expense_date", ""));
            if (TextUtils.isEmpty(entryDate)) {
                entryDate = normalizeDate(entry.optString("created_at", ""));
            }
            if (TextUtils.isEmpty(entryDate)) continue;

            if (localToday.equals(entryDate)) {
                targetDate = localToday;
                break;
            }
            if (targetDate == null || entryDate.compareTo(targetDate) > 0) {
                targetDate = entryDate;
            }
        }

        if (TextUtils.isEmpty(targetDate)) {
            return totals;
        }

        double totalAmount = 0;
        for (int i = 0; i < entries.length(); i++) {
            JSONObject entry = entries.optJSONObject(i);
            if (entry == null) continue;

            String entryDate = normalizeDate(entry.optString("expense_date", ""));
            if (TextUtils.isEmpty(entryDate)) {
                entryDate = normalizeDate(entry.optString("created_at", ""));
            }
            if (!targetDate.equals(entryDate)) continue;

            String category = entry.optString("category", "");
            double amount = entry.optDouble("amount", 0);
            totalAmount += amount;

            try {
                switch (category) {
                    case "cargo_service":
                        totals.put("cargo_service_cost", totals.optDouble("cargo_service_cost", 0) + amount);
                        break;
                    case "mobile":
                        totals.put("mobile_cost", totals.optDouble("mobile_cost", 0) + amount);
                        break;
                    case "moboil_change":
                        totals.put("moboil_change_cost", totals.optDouble("moboil_change_cost", 0) + amount);
                        break;
                    case "vehicle_maintenance":
                        totals.put("vehicle_maintenance_cost", totals.optDouble("vehicle_maintenance_cost", 0) + amount);
                        break;
                    case "mechanic":
                        totals.put("mechanic_cost", totals.optDouble("mechanic_cost", 0) + amount);
                        break;
                    case "medical":
                        totals.put("medical_cost", totals.optDouble("medical_cost", 0) + amount);
                        break;
                    case "food":
                        totals.put("food_cost", totals.optDouble("food_cost", 0) + amount);
                        break;
                    case "cargo_security_guard":
                        totals.put("cargo_security_guard_fee", totals.optDouble("cargo_security_guard_fee", 0) + amount);
                        break;
                    case "other":
                        totals.put("other_cost", totals.optDouble("other_cost", 0) + amount);
                        break;
                    default:
                        break;
                }
            } catch (Exception ignored) {
            }
        }

        try {
            totals.put("expense_date", targetDate);
            totals.put("total_amount", totalAmount);
        } catch (Exception ignored) {
        }

        return totals;
    }

    private String normalizeDate(String value) {
        if (TextUtils.isEmpty(value)) return "";
        String trimmed = value.trim();
        if (trimmed.length() >= 10) {
            return trimmed.substring(0, 10);
        }
        return trimmed;
    }

    private void bindTodaySummary(JSONObject todayExpense) {
        // This method can be expanded to update UI with today's totals if needed
    }

    private void saveDailyExpense(String category, String amount) {
        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("category", category);
        fields.put("amount", amount);
        saveDailyExpense(fields);
    }

    private void saveDailyExpense(Map<String, String> fields) {
        pendingSubmissionFields = new LinkedHashMap<>(fields);
        pendingSubmissionImageUri = null;
        setLoading(true);
        ensureLocationPermissionAndSubmit();
    }

    private void saveDailyExpenseDirect(Map<String, String> fields) {
        ApiClient.saveDailyExpense(baseUrl, sessionManager.getToken(), fields, new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                runOnUiThread(() -> {
                    setLoading(false);
                    Toast.makeText(DailyExpensesActivity.this, R.string.unable_to_save_daily_expense, Toast.LENGTH_LONG).show();
                });
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String body = response.body() != null ? response.body().string() : "";
                if (!response.isSuccessful()) {
                    final String message = ApiClient.parseErrorMessage(body, getString(R.string.unable_to_save_daily_expense));
                    runOnUiThread(() -> {
                        setLoading(false);
                        Toast.makeText(DailyExpensesActivity.this, message, Toast.LENGTH_LONG).show();
                    });
                    return;
                }

                runOnUiThread(() -> {
                    clearDraft();
                    resetSelection();
                    setLoading(false);
                    loadTodaySummary();
                    Toast.makeText(DailyExpensesActivity.this, R.string.daily_expense_saved, Toast.LENGTH_SHORT).show();
                });
            }
        });
    }

    private void saveDailyExpenseWithImage(Map<String, String> fields, Uri imageUri) {
        pendingSubmissionFields = new LinkedHashMap<>(fields);
        pendingSubmissionImageUri = imageUri;
        setLoading(true);
        ensureLocationPermissionAndSubmit();
    }

    private void saveDailyExpenseWithImageDirect(Map<String, String> fields, Uri imageUri) {
        ApiClient.saveDailyExpenseWithImage(
                baseUrl,
                sessionManager.getToken(),
                fields,
                imageUri,
                getContentResolver(),
                new Callback() {
                    @Override
                    public void onFailure(Call call, IOException e) {
                        runOnUiThread(() -> {
                            setLoading(false);
                            Toast.makeText(DailyExpensesActivity.this, R.string.unable_to_save_daily_expense, Toast.LENGTH_LONG).show();
                        });
                    }

                    @Override
                    public void onResponse(Call call, Response response) throws IOException {
                        String body = response.body() != null ? response.body().string() : "";
                        if (!response.isSuccessful()) {
                            final String message = ApiClient.parseErrorMessage(body, getString(R.string.unable_to_save_daily_expense));
                            runOnUiThread(() -> {
                                setLoading(false);
                                Toast.makeText(DailyExpensesActivity.this, message, Toast.LENGTH_LONG).show();
                            });
                            return;
                        }

                        runOnUiThread(() -> {
                            clearDraft();
                            resetSelection();
                            setLoading(false);
                            loadTodaySummary();
                            Toast.makeText(DailyExpensesActivity.this, R.string.daily_expense_saved, Toast.LENGTH_SHORT).show();
                        });
                    }
                }
        );
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
                runOnUiThread(DailyExpensesActivity.this::proceedWithPendingExpenseSubmission);
            }

            @Override
            public void onResponse(Call call, Response response) {
                response.close();
                runOnUiThread(DailyExpensesActivity.this::proceedWithPendingExpenseSubmission);
            }
        });
    }

    private Map<String, String> buildLocationFields(Location location) {
        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("latitude", String.format(Locale.US, "%.7f", location.getLatitude()));
        fields.put("longitude", String.format(Locale.US, "%.7f", location.getLongitude()));
        fields.put("source", "driver_app_daily_expense");

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
        Map<String, String> fields = pendingSubmissionFields;
        Uri imageUri = pendingSubmissionImageUri;
        pendingSubmissionFields = null;
        pendingSubmissionImageUri = null;

        if (fields == null || fields.isEmpty()) {
            setLoading(false);
            return;
        }

        if (imageUri != null) {
            saveDailyExpenseWithImageDirect(fields, imageUri);
        } else {
            saveDailyExpenseDirect(fields);
        }
    }

    private Uri saveBitmapToCache(Bitmap bitmap) {
        if (bitmap == null) return null;
        try {
            File cachePath = new File(getCacheDir(), "images");
            if (!cachePath.exists() && !cachePath.mkdirs()) {
                return null;
            }
            File file = new File(cachePath, "image_" + System.currentTimeMillis() + ".jpg");
            FileOutputStream stream = new FileOutputStream(file);
            bitmap.compress(Bitmap.CompressFormat.JPEG, 100, stream);
            stream.close();
            return Uri.fromFile(file);
        } catch (IOException e) {
            e.printStackTrace();
            return null;
        }
    }

    private void setLoading(boolean loading) {
        binding.loadingOverlay.setVisibility(loading ? View.VISIBLE : View.GONE);
        binding.saveExpenseButton.setEnabled(!loading);
        binding.backButton.setEnabled(!loading);
    }

    private void saveDraft() {
        getSharedPreferences(PREF_NAME, MODE_PRIVATE)
                .edit()
                .putString("selected_category", selectedCategory)
                .apply();
    }

    private void restoreDraft() {
        SharedPreferences preferences = getSharedPreferences(PREF_NAME, MODE_PRIVATE);
        selectedCategory = preferences.getString("selected_category", null);
        if (!TextUtils.isEmpty(selectedCategory)) {
            selectedCategory = null;
        }
    }

    private void clearDraft() {
        getSharedPreferences(PREF_NAME, MODE_PRIVATE)
                .edit()
                .remove("selected_category")
                .apply();
    }

    private String getExpenseLabel(String category) {
        switch (category) {
            case "cargo_service": return getString(R.string.cargo_service_cost);
            case "mobile": return getString(R.string.mobile_cost);
            case "moboil_change": return getString(R.string.moboil_change_cost);
            case "vehicle_maintenance": return getString(R.string.vehicle_maintenance_cost);
            case "mechanic": return getString(R.string.mechanic_cost);
            case "medical": return getString(R.string.medical_cost);
            case "food": return getString(R.string.food_cost);
            case "cargo_security_guard": return getString(R.string.security_guard_fee);
            case "other": return getString(R.string.other_cost);
            default: return category;
        }
    }

    private int getDialogIconRes(String category) {
        switch (category) {
            case "cargo_service": return R.drawable.ic_cargo_service;
            case "mobile": return R.drawable.ic_cargo_mobile;
            case "moboil_change": return R.drawable.ic_cargo_moboil;
            case "vehicle_maintenance": return R.drawable.ic_cargo_mechanic;
            case "mechanic": return R.drawable.ic_cargo_mechanic;
            case "medical": return android.R.drawable.ic_menu_info_details;
            case "food": return R.drawable.ic_cargo_food;
            case "cargo_security_guard": return R.drawable.ic_cargo_guard;
            case "other": return android.R.drawable.ic_menu_add;
            default: return R.drawable.ic_cargo_service;
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

    private String getInput(com.google.android.material.textfield.TextInputEditText input) {
        return input.getText() != null ? input.getText().toString().trim() : "";
    }

    private void showMoboilDialog() {
        View view = LayoutInflater.from(this).inflate(R.layout.dialog_moboil_entry, null, false);
        TextInputEditText amountInput = view.findViewById(R.id.dialogAmountInput);
        TextInputEditText meterInput = view.findViewById(R.id.dialogMeterInput);

        Dialog dialog = new MaterialAlertDialogBuilder(this)
                .setTitle(R.string.moboil_change_cost)
                .setView(view)
                .setNegativeButton(R.string.close, null)
                .setPositiveButton(R.string.save_moboil_expense, null)
                .create();

        dialog.setOnShowListener(ignored -> {
            android.widget.Button positiveButton = dialog.findViewById(android.R.id.button1);
            if (positiveButton != null) {
                positiveButton.setOnClickListener(v -> {
                    String amount = getInput(amountInput);
                    String meterReading = getInput(meterInput);
                    if (TextUtils.isEmpty(amount)) {
                        amountInput.setError(getString(R.string.enter_expense_amount));
                        return;
                    }
                    if (TextUtils.isEmpty(meterReading)) {
                        meterInput.setError(getString(R.string.moboil_meter_required));
                        return;
                    }

                    Map<String, String> fields = new LinkedHashMap<>();
                    fields.put("category", "moboil_change");
                    fields.put("amount", amount);
                    fields.put("meter_reading", meterReading);
                    saveDailyExpense(fields);
                    dialog.dismiss();
                });
            }
        });

        dialog.show();
    }
}
