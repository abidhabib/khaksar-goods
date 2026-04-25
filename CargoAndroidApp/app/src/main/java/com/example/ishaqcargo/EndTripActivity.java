package com.example.ishaqcargo;

import android.content.Intent;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.View;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
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
import java.util.HashMap;
import java.util.LinkedHashMap;
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

    private final ActivityResultLauncher<Intent> dieselExpenseLauncher = registerForActivityResult(
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
        bindStaticTripDetails();
        setupExpenseWidgets();

        binding.backButton.setVisibility(lockedMode ? View.GONE : View.VISIBLE);
        binding.backButton.setOnClickListener(v -> {
            if (!lockedMode) {
                finish();
            }
        });
        binding.submitTripButton.setOnClickListener(v -> openEndTripDetails());

        loadTripExpenseHistory();
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
    }

    private void setupExpenseWidgets() {
        binding.dieselExpenseCard.setOnClickListener(v -> openDieselExpenseScreen());
        bindSimpleExpenseCard(binding.tollExpenseCard, "toll", R.string.toll_cost);
        bindSimpleExpenseCard(binding.foodExpenseCard, "food", R.string.food_cost);
        bindSimpleExpenseCard(binding.policeExpenseCard, "police", R.string.police_cost);
        bindSimpleExpenseCard(binding.chalaanExpenseCard, "chalaan", R.string.chalaan_cost);
        bindSimpleExpenseCard(binding.rewardExpenseCard, "reward", R.string.reward_cost);
        bindSimpleExpenseCard(binding.tyrePunctureExpenseCard, "tyre_puncture", R.string.tyre_puncture_cost);

        styleWidgetCard(binding.dieselExpenseCard, R.color.trips_widget_bg, R.drawable.ic_cargo_diesel);
        styleWidgetCard(binding.tollExpenseCard, R.color.km_widget_bg, R.drawable.ic_cargo_toll);
        styleWidgetCard(binding.foodExpenseCard, R.color.expenses_widget_bg, R.drawable.ic_cargo_food);
        styleWidgetCard(binding.policeExpenseCard, R.color.revenue_widget_bg, R.drawable.ic_cargo_guard);
        styleWidgetCard(binding.chalaanExpenseCard, R.color.button_primary, R.drawable.ic_cargo_service);
        styleWidgetCard(binding.rewardExpenseCard, R.color.button_emerald_active, R.drawable.ic_cargo_mobile);
        styleWidgetCard(binding.tyrePunctureExpenseCard, R.color.button_amber, R.drawable.ic_cargo_mechanic);
    }

    private void bindSimpleExpenseCard(View card, String category, int titleRes) {
        card.setOnClickListener(v -> AmountEntryDialogHelper.show(
                this,
                getDialogIconRes(category),
                getString(R.string.add_expense_for, getString(titleRes)),
                "",
                amount -> saveExpenseEntry(category, amount)
        ));
    }

    private void openDieselExpenseScreen() {
        Intent intent = new Intent(this, DieselExpenseActivity.class);
        intent.putExtra(EXTRA_TRIP_ID, tripId);
        dieselExpenseLauncher.launch(intent);
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
                        renderExpenseTotals(expenses);
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

    private void renderExpenseTotals(JSONArray expenses) {
        expenseTotals.clear();

        if (expenses != null) {
            for (int index = 0; index < expenses.length(); index++) {
                JSONObject expense = expenses.optJSONObject(index);
                if (expense == null) {
                    continue;
                }

                String category = expense.optString("category", "");
                double amount = expense.optDouble("amount", 0);
                expenseTotals.put(category, expenseTotals.getOrDefault(category, 0d) + amount);
            }
        }

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

    private void setSubmitting(boolean submitting) {
        binding.loadingOverlay.setVisibility(submitting ? View.VISIBLE : View.GONE);
        binding.submitTripButton.setEnabled(!submitting);
        setCardEnabled(binding.dieselExpenseCard, !submitting);
        setCardEnabled(binding.tollExpenseCard, !submitting);
        setCardEnabled(binding.foodExpenseCard, !submitting);
        setCardEnabled(binding.policeExpenseCard, !submitting);
        setCardEnabled(binding.chalaanExpenseCard, !submitting);
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
