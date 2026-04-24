package com.example.ishaqcargo;

import android.os.Bundle;
import android.text.TextUtils;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.example.ishaqcargo.databinding.ActivityDailyExpensesBinding;
import com.example.ishaqcargo.network.ApiClient;
import com.example.ishaqcargo.util.SessionManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.LinkedHashMap;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Locale;
import java.util.Map;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;

public class DailyExpensesActivity extends AppCompatActivity {

    private static final DateTimeFormatter SERVER_DATE = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final DateTimeFormatter SERVER_DATE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final DateTimeFormatter DISPLAY_DATE = DateTimeFormatter.ofPattern("EEE, dd MMM yyyy", Locale.US);
    private static final DateTimeFormatter DISPLAY_TIME = DateTimeFormatter.ofPattern("hh:mm a", Locale.US);

    private ActivityDailyExpensesBinding binding;
    private SessionManager sessionManager;
    private String baseUrl;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        binding = ActivityDailyExpensesBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());
        WindowCompat.getInsetsController(getWindow(), binding.getRoot()).setAppearanceLightStatusBars(true);

        sessionManager = new SessionManager(this);
        baseUrl = sessionManager.getBaseUrl();

        applyWindowInsets();
        setDefaults();

        binding.backButton.setOnClickListener(v -> finish());
        binding.loadMonthButton.setOnClickListener(v -> loadDailyExpenses());
        binding.saveExpenseButton.setOnClickListener(v -> saveDailyExpense());

        loadDailyExpenses();
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

    private void setDefaults() {
        Date today = new Date();
        binding.monthFilterInput.setText(new SimpleDateFormat("yyyy-MM", Locale.US).format(today));
        binding.expenseDateInput.setText(new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(today));
    }

    private void loadDailyExpenses() {
        String token = sessionManager.getToken();
        String month = getInput(binding.monthFilterInput);

        setLoading(true);

        ApiClient.getDailyExpenses(baseUrl, token, month, new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                runOnUiThread(() -> {
                    setLoading(false);
                    Toast.makeText(DailyExpensesActivity.this, "Unable to load daily expenses", Toast.LENGTH_LONG).show();
                });
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String body = response.body() != null ? response.body().string() : "";

                if (!response.isSuccessful()) {
                    String message = ApiClient.parseErrorMessage(body, "Failed to load daily expenses");
                    runOnUiThread(() -> {
                        setLoading(false);
                        Toast.makeText(DailyExpensesActivity.this, message, Toast.LENGTH_LONG).show();
                    });
                    return;
                }

                try {
                    JSONObject root = new JSONObject(body);
                    JSONArray expenses = root.optJSONArray("expenses");
                    JSONObject summary = root.optJSONObject("summary");
                    runOnUiThread(() -> {
                        bindSummary(summary);
                        renderExpenseHistory(expenses);
                        setLoading(false);
                    });
                } catch (Exception exception) {
                    runOnUiThread(() -> {
                        setLoading(false);
                        Toast.makeText(DailyExpensesActivity.this, "Invalid daily expense response", Toast.LENGTH_LONG).show();
                    });
                }
            }
        });
    }

    private void saveDailyExpense() {
        String expenseDate = getInput(binding.expenseDateInput);
        if (!expenseDate.matches("\\d{4}-\\d{2}-\\d{2}")) {
            Toast.makeText(this, R.string.valid_expense_date_required, Toast.LENGTH_SHORT).show();
            return;
        }

        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("expense_date", expenseDate);
        fields.put("cargo_service_cost", getNumericInput(binding.cargoServiceCostInput));
        fields.put("mobile_cost", getNumericInput(binding.mobileCostInput));
        fields.put("moboil_change_cost", getNumericInput(binding.moboilChangeCostInput));
        fields.put("mechanic_cost", getNumericInput(binding.mechanicCostInput));
        fields.put("food_cost", getNumericInput(binding.foodCostInput));
        fields.put("cargo_security_guard_fee", getNumericInput(binding.securityGuardFeeInput));
        fields.put("other_cost", getNumericInput(binding.otherCostInput));
        fields.put("notes", getInput(binding.notesInput));

        setLoading(true);

        ApiClient.saveDailyExpense(baseUrl, sessionManager.getToken(), fields, new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                runOnUiThread(() -> {
                    setLoading(false);
                    Toast.makeText(DailyExpensesActivity.this, "Unable to save daily expense", Toast.LENGTH_LONG).show();
                });
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String body = response.body() != null ? response.body().string() : "";

                if (!response.isSuccessful()) {
                    String message = ApiClient.parseErrorMessage(body, "Failed to save daily expense");
                    runOnUiThread(() -> {
                        setLoading(false);
                        Toast.makeText(DailyExpensesActivity.this, message, Toast.LENGTH_LONG).show();
                    });
                    return;
                }

                runOnUiThread(() -> {
                    Toast.makeText(DailyExpensesActivity.this, R.string.daily_expense_saved, Toast.LENGTH_SHORT).show();
                    String expenseMonth = expenseDate.substring(0, 7);
                    binding.monthFilterInput.setText(expenseMonth);
                    loadDailyExpenses();
                });
            }
        });
    }

    private void bindSummary(JSONObject summary) {
        double totalAmount = summary != null ? summary.optDouble("total_amount", 0) : 0;
        int totalDays = summary != null ? summary.optInt("total_days", 0) : 0;

        binding.totalExpenseValue.setText(formatCurrency(totalAmount));
        binding.totalDaysValue.setText(String.valueOf(totalDays));
    }

    private void renderExpenseHistory(JSONArray expenses) {
        binding.historyContainer.removeAllViews();
        LayoutInflater inflater = LayoutInflater.from(this);

        if (expenses == null || expenses.length() == 0) {
            binding.emptyState.setVisibility(View.VISIBLE);
            return;
        }

        binding.emptyState.setVisibility(View.GONE);

        for (int i = 0; i < expenses.length(); i++) {
            JSONObject item = expenses.optJSONObject(i);
            if (item == null) {
                continue;
            }

            View card = inflater.inflate(R.layout.item_daily_expense, binding.historyContainer, false);
            bindHistoryCard(card, item);
            binding.historyContainer.addView(card);
        }
    }

    private void bindHistoryCard(View card, JSONObject item) {
        TextView dateText = card.findViewById(R.id.expenseDateText);
        TextView totalText = card.findViewById(R.id.expenseTotalText);
        TextView categoryText = card.findViewById(R.id.expenseCategoryText);
        TextView notesText = card.findViewById(R.id.expenseNotesText);

        String formattedDate = formatHistoryDate(item.optString("expense_date", ""));
        String formattedTime = formatHistoryTime(item.optString("created_at", ""));
        dateText.setText(TextUtils.isEmpty(formattedTime) ? formattedDate : formattedDate + " • " + formattedTime);
        totalText.setText(formatCurrency(item.optDouble("total_amount", 0)));
        categoryText.setText(getString(
                R.string.daily_expense_breakdown,
                formatCurrency(item.optDouble("cargo_service_cost", 0)),
                formatCurrency(item.optDouble("mobile_cost", 0)),
                formatCurrency(item.optDouble("moboil_change_cost", 0)),
                formatCurrency(item.optDouble("mechanic_cost", 0)),
                formatCurrency(item.optDouble("food_cost", 0)),
                formatCurrency(item.optDouble("cargo_security_guard_fee", 0)),
                formatCurrency(item.optDouble("other_cost", 0))
        ));

        String notes = item.optString("notes", "");
        notesText.setText(TextUtils.isEmpty(notes) ? getString(R.string.trip_notes_empty) : notes);
    }

    private String formatHistoryDate(String rawValue) {
        if (TextUtils.isEmpty(rawValue) || "null".equalsIgnoreCase(rawValue)) {
            return "-";
        }

        try {
            return LocalDate.parse(rawValue, SERVER_DATE).format(DISPLAY_DATE);
        } catch (DateTimeParseException ignored) {
            return rawValue;
        }
    }

    private String formatHistoryTime(String rawValue) {
        if (TextUtils.isEmpty(rawValue) || "null".equalsIgnoreCase(rawValue)) {
            return "";
        }

        try {
            return LocalDateTime.parse(rawValue, SERVER_DATE_TIME).format(DISPLAY_TIME);
        } catch (DateTimeParseException ignored) {
            return "";
        }
    }

    private void setLoading(boolean loading) {
        binding.loadingOverlay.setVisibility(loading ? View.VISIBLE : View.GONE);
        binding.saveExpenseButton.setEnabled(!loading);
        binding.loadMonthButton.setEnabled(!loading);
        binding.backButton.setEnabled(!loading);
    }

    private String formatCurrency(double amount) {
        return String.format(Locale.US, "Rs %.0f", amount);
    }

    private String getInput(com.google.android.material.textfield.TextInputEditText input) {
        return input.getText() != null ? input.getText().toString().trim() : "";
    }

    private String getNumericInput(com.google.android.material.textfield.TextInputEditText input) {
        String value = getInput(input);
        return TextUtils.isEmpty(value) ? "0" : value;
    }
}
