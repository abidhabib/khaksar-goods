package com.example.ishaqcargo;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.example.ishaqcargo.databinding.ActivityAccountHistoryBinding;
import com.example.ishaqcargo.databinding.ItemAccountHistoryEntryBinding;
import com.example.ishaqcargo.network.ApiClient;
import com.example.ishaqcargo.util.SessionManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.util.Locale;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;

public class AccountHistoryActivity extends AppCompatActivity {

    public static final String MODE_DRIVER = "driver";
    public static final String MODE_HELPER = "helper";
    public static final String HISTORY_CASHOUT = "cashout";
    public static final String HISTORY_COMMISSION = "commission";

    private static final String EXTRA_MODE = "mode";
    private static final String EXTRA_HISTORY_TYPE = "history_type";

    private ActivityAccountHistoryBinding binding;
    private SessionManager sessionManager;
    private String baseUrl;
    private String mode;
    private String historyType;

    public static Intent newIntent(Context context, String mode, String historyType) {
        Intent intent = new Intent(context, AccountHistoryActivity.class);
        intent.putExtra(EXTRA_MODE, mode);
        intent.putExtra(EXTRA_HISTORY_TYPE, historyType);
        return intent;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        binding = ActivityAccountHistoryBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());
        WindowCompat.getInsetsController(getWindow(), binding.getRoot()).setAppearanceLightStatusBars(true);

        sessionManager = new SessionManager(this);
        baseUrl = sessionManager.getBaseUrl();

        mode = getIntent().getStringExtra(EXTRA_MODE);
        historyType = getIntent().getStringExtra(EXTRA_HISTORY_TYPE);
        if (!MODE_HELPER.equals(mode)) {
            mode = MODE_DRIVER;
        }
        if (!HISTORY_COMMISSION.equals(historyType)) {
            historyType = HISTORY_CASHOUT;
        }
        if (MODE_HELPER.equals(mode)) {
            historyType = HISTORY_CASHOUT;
        }

        applyWindowInsets();
        setupHeader();
        binding.backButton.setOnClickListener(v -> finish());
        fetchHistory();
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

    private void setupHeader() {
        binding.screenTitle.setText(getScreenTitle());
        binding.screenSubtitle.setText(getScreenSubtitle());
    }

    private void fetchHistory() {
        setLoading(true);
        Callback callback = new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                runOnUiThread(() -> {
                    setLoading(false);
                    Toast.makeText(AccountHistoryActivity.this, R.string.account_history_load_failed, Toast.LENGTH_SHORT).show();
                });
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String body = response.body() != null ? response.body().string() : "";
                if (!response.isSuccessful()) {
                    String message = ApiClient.parseErrorMessage(body, getString(R.string.account_history_load_failed));
                    runOnUiThread(() -> {
                        setLoading(false);
                        Toast.makeText(AccountHistoryActivity.this, message, Toast.LENGTH_SHORT).show();
                    });
                    return;
                }

                try {
                    JSONObject root = new JSONObject(body);
                    JSONArray rows = MODE_HELPER.equals(mode)
                            ? root.optJSONArray("cashouts")
                            : (HISTORY_COMMISSION.equals(historyType) ? root.optJSONArray("commissions") : root.optJSONArray("cashouts"));

                    runOnUiThread(() -> {
                        renderHistory(rows);
                        setLoading(false);
                    });
                } catch (Exception e) {
                    runOnUiThread(() -> {
                        setLoading(false);
                        Toast.makeText(AccountHistoryActivity.this, R.string.account_history_invalid_response, Toast.LENGTH_SHORT).show();
                    });
                }
            }
        };

        if (MODE_HELPER.equals(mode)) {
            ApiClient.getHelperAccount(baseUrl, sessionManager.getToken(), callback);
        } else {
            ApiClient.getDriverAccount(baseUrl, sessionManager.getToken(), callback);
        }
    }

    private void renderHistory(JSONArray rows) {
        binding.historyList.removeAllViews();
        LayoutInflater inflater = LayoutInflater.from(this);

        if (rows == null || rows.length() == 0) {
            binding.emptyStateCard.setVisibility(View.VISIBLE);
            return;
        }

        binding.emptyStateCard.setVisibility(View.GONE);

        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.optJSONObject(i);
            if (row == null) {
                continue;
            }

            ItemAccountHistoryEntryBinding itemBinding = ItemAccountHistoryEntryBinding.inflate(inflater, binding.historyList, false);
            bindHistoryItem(itemBinding, row);
            binding.historyList.addView(itemBinding.getRoot());
        }
    }

    private void bindHistoryItem(ItemAccountHistoryEntryBinding itemBinding, JSONObject row) {
        if (MODE_HELPER.equals(mode)) {
            bindHelperCashoutItem(itemBinding, row);
            return;
        }

        if (HISTORY_COMMISSION.equals(historyType)) {
            bindCommissionItem(itemBinding, row);
        } else {
            bindDriverCashoutItem(itemBinding, row);
        }
    }

    private void bindCommissionItem(ItemAccountHistoryEntryBinding itemBinding, JSONObject row) {
        itemBinding.titleText.setText(getString(R.string.commission_trip_title, row.optInt("trip_id")));
        itemBinding.subtitleText.setText(getString(
                R.string.commission_history_subtitle_format,
                formatPercent(row.optDouble("commission_percentage", 0)),
                formatCurrency(row.optDouble("net_profit", 0))
        ));
        itemBinding.amountText.setText(formatCurrency(row.optDouble("commission_amount", 0)));
        itemBinding.statusText.setText(formatStatus(row.optString("status", "pending")));
        itemBinding.metaText.setText(buildDateLine(row.optString("created_at", ""), row.optString("reviewed_at", "")));
    }

    private void bindDriverCashoutItem(ItemAccountHistoryEntryBinding itemBinding, JSONObject row) {
        itemBinding.titleText.setText(getString(
                R.string.cashout_history_title_format,
                formatBalanceType(row.optString("balance_type", AccountCashoutActivity.BALANCE_AVAILABLE))
        ));
        itemBinding.subtitleText.setText(getString(
                R.string.cashout_history_subtitle_format,
                formatReceiveMethod(row.optString("receive_method", "cash"))
        ));
        itemBinding.amountText.setText(formatCurrency(row.optDouble("amount", 0)));
        itemBinding.statusText.setText(formatStatus(row.optString("status", "pending")));
        itemBinding.metaText.setText(buildDateLine(row.optString("created_at", ""), row.optString("reviewed_at", "")));
    }

    private void bindHelperCashoutItem(ItemAccountHistoryEntryBinding itemBinding, JSONObject row) {
        itemBinding.titleText.setText(getString(R.string.helper_cashout_history_title));
        itemBinding.subtitleText.setText(getString(
                R.string.cashout_history_subtitle_format,
                formatReceiveMethod(row.optString("receive_method", "cash"))
        ));
        itemBinding.amountText.setText(formatCurrency(row.optDouble("amount", 0)));
        itemBinding.statusText.setText(formatStatus(row.optString("status", "pending")));
        itemBinding.metaText.setText(buildDateLine(row.optString("created_at", ""), row.optString("reviewed_at", "")));
    }

    private String buildDateLine(String createdAt, String reviewedAt) {
        if (reviewedAt == null || reviewedAt.isEmpty() || "null".equalsIgnoreCase(reviewedAt)) {
            return getString(R.string.requested_on_format, simplifyTimestamp(createdAt));
        }
        return getString(R.string.reviewed_on_format, simplifyTimestamp(createdAt), simplifyTimestamp(reviewedAt));
    }

    private String simplifyTimestamp(String raw) {
        if (raw == null) {
            return "-";
        }
        return raw.replace('T', ' ');
    }

    private String getScreenTitle() {
        if (MODE_HELPER.equals(mode)) {
            return getString(R.string.cashout_payment_history);
        }
        if (HISTORY_COMMISSION.equals(historyType)) {
            return getString(R.string.commission_request_history);
        }
        return getString(R.string.cashout_payment_history);
    }

    private String getScreenSubtitle() {
        if (MODE_HELPER.equals(mode)) {
            return getString(R.string.helper_history_subtitle);
        }
        if (HISTORY_COMMISSION.equals(historyType)) {
            return getString(R.string.driver_commission_history_subtitle);
        }
        return getString(R.string.driver_cashout_history_subtitle);
    }

    private String formatCurrency(double value) {
        return String.format(Locale.US, "Rs %.0f", value);
    }

    private String formatPercent(double value) {
        return String.format(Locale.US, "%.0f%%", value);
    }

    private String formatStatus(String status) {
        if ("approved".equalsIgnoreCase(status)) {
            return getString(R.string.status_approved);
        }
        if ("rejected".equalsIgnoreCase(status)) {
            return getString(R.string.status_rejected);
        }
        return getString(R.string.status_pending);
    }

    private String formatBalanceType(String balanceType) {
        if (AccountCashoutActivity.BALANCE_COMMISSION.equals(balanceType)) {
            return getString(R.string.driver_commission_balance);
        }
        return getString(R.string.driver_available_amount);
    }

    private String formatReceiveMethod(String method) {
        if ("account".equalsIgnoreCase(method)) {
            return getString(R.string.receive_in_account);
        }
        return getString(R.string.receive_in_cash);
    }

    private void setLoading(boolean loading) {
        binding.loadingOverlay.setVisibility(loading ? View.VISIBLE : View.GONE);
    }
}
