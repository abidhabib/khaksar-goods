package com.example.ishaqcargo;

import android.app.Dialog;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
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

import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.LinkedHashMap;
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
    private final Map<String, Double> todayTotals = new HashMap<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        binding = ActivityDailyExpensesBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());
        WindowCompat.getInsetsController(getWindow(), binding.getRoot()).setAppearanceLightStatusBars(true);

        sessionManager = new SessionManager(this);
        baseUrl = sessionManager.getBaseUrl();

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
        bindExpenseCard(binding.cargoServiceCard, "cargo_service", R.string.cargo_service_cost);
        bindExpenseCard(binding.mobileCostCard, "mobile", R.string.mobile_cost);
        bindMoboilExpenseCard();
        bindExpenseCard(binding.vehicleMaintenanceCard, "vehicle_maintenance", R.string.vehicle_maintenance_cost);
        bindExpenseCard(binding.mechanicCostCard, "mechanic", R.string.mechanic_cost);
        bindExpenseCard(binding.medicalCostCard, "medical", R.string.medical_cost);
        bindExpenseCard(binding.foodCostCard, "food", R.string.food_cost);
        bindExpenseCard(binding.securityGuardFeeCard, "cargo_security_guard", R.string.security_guard_fee);
        styleWidgetCard(binding.cargoServiceCard, R.color.trips_widget_bg, R.drawable.ic_cargo_service);
        styleWidgetCard(binding.mobileCostCard, R.color.trips_widget_bg, R.drawable.ic_cargo_mobile);
        styleWidgetCard(binding.moboilChangeCard, R.color.trips_widget_bg, R.drawable.ic_cargo_moboil);
        styleWidgetCard(binding.vehicleMaintenanceCard, R.color.trips_widget_bg, R.drawable.ic_cargo_mechanic);
        styleWidgetCard(binding.mechanicCostCard, R.color.trips_widget_bg, R.drawable.ic_cargo_mechanic);
        styleWidgetCard(binding.medicalCostCard, R.color.trips_widget_bg, android.R.drawable.ic_menu_info_details);
        styleWidgetCard(binding.foodCostCard, R.color.trips_widget_bg, R.drawable.ic_cargo_food);
        styleWidgetCard(binding.securityGuardFeeCard, R.color.trips_widget_bg, R.drawable.ic_cargo_guard);
    }

    private void bindMoboilExpenseCard() {
        binding.moboilChangeCard.setOnClickListener(v -> showMoboilDialog());
    }

    private void bindExpenseCard(View card, String category, int titleRes) {
        card.setOnClickListener(v -> {
            selectedCategory = category;
            AmountEntryDialogHelper.show(
                    this,
                    getDialogIconRes(category),
                    getString(titleRes),
                    "",
                    amount -> {
                        saveDailyExpense(category, amount);
                    }
            );
        });
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
            if (entry == null) {
                continue;
            }

            String entryDate = normalizeDate(entry.optString("expense_date", ""));
            if (TextUtils.isEmpty(entryDate)) {
                entryDate = normalizeDate(entry.optString("created_at", ""));
            }

            if (TextUtils.isEmpty(entryDate)) {
                continue;
            }

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
            if (entry == null) {
                continue;
            }

            String entryDate = normalizeDate(entry.optString("expense_date", ""));
            if (TextUtils.isEmpty(entryDate)) {
                entryDate = normalizeDate(entry.optString("created_at", ""));
            }

            if (!targetDate.equals(entryDate)) {
                continue;
            }

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
        if (TextUtils.isEmpty(value)) {
            return "";
        }

        String trimmed = value.trim();
        if (trimmed.length() >= 10) {
            return trimmed.substring(0, 10);
        }

        return trimmed;
    }

    private void bindTodaySummary(JSONObject todayExpense) {
        todayTotals.clear();

        if (todayExpense != null) {
            todayTotals.put("cargo_service", todayExpense.optDouble("cargo_service_cost", 0));
            todayTotals.put("mobile", todayExpense.optDouble("mobile_cost", 0));
            todayTotals.put("moboil_change", todayExpense.optDouble("moboil_change_cost", 0));
            todayTotals.put("vehicle_maintenance", todayExpense.optDouble("vehicle_maintenance_cost", 0));
            todayTotals.put("mechanic", todayExpense.optDouble("mechanic_cost", 0));
            todayTotals.put("medical", todayExpense.optDouble("medical_cost", 0));
            todayTotals.put("food", todayExpense.optDouble("food_cost", 0));
            todayTotals.put("cargo_security_guard", todayExpense.optDouble("cargo_security_guard_fee", 0));
        }

        
    }

    private void saveDailyExpense(String category, String amount) {
        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("category", category);
        fields.put("amount", amount);
        saveDailyExpense(fields);
    }

    private void saveDailyExpense(Map<String, String> fields) {

        setLoading(true);

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
                    setLoading(false);
                    loadTodaySummary();
                    Toast.makeText(DailyExpensesActivity.this, R.string.daily_expense_saved, Toast.LENGTH_SHORT).show();
                });
            }
        });
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
            case "cargo_service":
                return getString(R.string.cargo_service_cost);
            case "mobile":
                return getString(R.string.mobile_cost);
            case "moboil_change":
                return getString(R.string.moboil_change_cost);
            case "vehicle_maintenance":
                return getString(R.string.vehicle_maintenance_cost);
            case "mechanic":
                return getString(R.string.mechanic_cost);
            case "medical":
                return getString(R.string.medical_cost);
            case "food":
                return getString(R.string.food_cost);
            case "cargo_security_guard":
                return getString(R.string.security_guard_fee);
            default:
                return category;
        }
    }

    private int getDialogIconRes(String category) {
        switch (category) {
            case "cargo_service":
                return R.drawable.ic_cargo_service;
            case "mobile":
                return R.drawable.ic_cargo_mobile;
            case "moboil_change":
                return R.drawable.ic_cargo_moboil;
            case "vehicle_maintenance":
                return R.drawable.ic_cargo_mechanic;
            case "mechanic":
                return R.drawable.ic_cargo_mechanic;
            case "medical":
                return android.R.drawable.ic_menu_info_details;
            case "food":
                return R.drawable.ic_cargo_food;
            case "cargo_security_guard":
                return R.drawable.ic_cargo_guard;
            default:
                return R.drawable.ic_cargo_service;
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
