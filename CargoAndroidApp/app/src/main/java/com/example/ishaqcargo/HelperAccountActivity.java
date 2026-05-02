package com.example.ishaqcargo;

import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.example.ishaqcargo.databinding.ActivityHelperAccountBinding;
import com.example.ishaqcargo.network.ApiClient;
import com.example.ishaqcargo.util.SessionManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.util.Locale;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;

public class HelperAccountActivity extends AppCompatActivity {

    private ActivityHelperAccountBinding binding;
    private SessionManager sessionManager;
    private String baseUrl;
    private double helperAvailableBalance;
    private boolean hasAssignedHelper;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        binding = ActivityHelperAccountBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());
        WindowCompat.getInsetsController(getWindow(), binding.getRoot()).setAppearanceLightStatusBars(true);

        sessionManager = new SessionManager(this);
        baseUrl = sessionManager.getBaseUrl();

        applyWindowInsets();
        setupActions();
        fetchHelperAccount();
    }

    @Override
    protected void onResume() {
        super.onResume();
        fetchHelperAccount();
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

    private void setupActions() {
        binding.backButton.setOnClickListener(v -> finish());
        binding.helperCashoutButton.setOnClickListener(v -> {
            if (!hasAssignedHelper) {
                Toast.makeText(this, R.string.helper_account_missing_helper, Toast.LENGTH_SHORT).show();
                return;
            }
            startActivity(AccountCashoutActivity.newIntent(
                    this,
                    AccountCashoutActivity.MODE_HELPER,
                    AccountCashoutActivity.BALANCE_AVAILABLE,
                    helperAvailableBalance
            ));
        });
        binding.helperHistoryCard.setOnClickListener(v -> {
            if (!hasAssignedHelper) {
                Toast.makeText(this, R.string.helper_account_missing_helper, Toast.LENGTH_SHORT).show();
                return;
            }
            startActivity(AccountHistoryActivity.newIntent(this, AccountHistoryActivity.MODE_HELPER, AccountHistoryActivity.HISTORY_CASHOUT));
        });
    }

    private void fetchHelperAccount() {
        setLoading(true);
        ApiClient.getHelperAccount(baseUrl, sessionManager.getToken(), new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                runOnUiThread(() -> {
                    setLoading(false);
                    Toast.makeText(HelperAccountActivity.this, R.string.helper_account_load_failed, Toast.LENGTH_SHORT).show();
                });
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String body = response.body() != null ? response.body().string() : "";

                if (!response.isSuccessful()) {
                    String message = ApiClient.parseErrorMessage(body, getString(R.string.helper_account_load_failed));
                    runOnUiThread(() -> {
                        setLoading(false);
                        bindMissingHelperState();
                        Toast.makeText(HelperAccountActivity.this, message, Toast.LENGTH_SHORT).show();
                    });
                    return;
                }

                try {
                    JSONObject root = new JSONObject(body);
                    JSONObject helper = root.optJSONObject("helper");
                    JSONObject driver = root.optJSONObject("driver");
                    JSONArray cashouts = root.optJSONArray("cashouts");

                    runOnUiThread(() -> {
                        bindHelperAccount(driver, helper, cashouts);
                        setLoading(false);
                    });
                } catch (Exception e) {
                    runOnUiThread(() -> {
                        setLoading(false);
                        Toast.makeText(HelperAccountActivity.this, R.string.helper_account_invalid_response, Toast.LENGTH_SHORT).show();
                    });
                }
            }
        });
    }

    private void bindHelperAccount(JSONObject driver, JSONObject helper, JSONArray cashouts) {
        hasAssignedHelper = helper != null && helper.length() > 0;
        helperAvailableBalance = helper != null ? helper.optDouble("available_balance", 0) : 0;

        String helperName = helper != null ? helper.optString("helper_name", getString(R.string.helper_account_default_name)) : getString(R.string.helper_account_default_name);
        String salaryText = helper != null ? formatCurrency(helper.optDouble("salary_amount", 0)) : formatCurrency(0);
        String driverName = driver != null ? driver.optString("full_name", getString(R.string.driver_account_default_name)) : getString(R.string.driver_account_default_name);
        String carNumber = driver != null ? driver.optString("car_number", getString(R.string.driver_account_no_car)) : getString(R.string.driver_account_no_car);

        binding.helperNameText.setText(helperName);
        binding.helperMetaText.setText(getString(R.string.helper_account_meta, salaryText));
        binding.helperLinkedText.setText(getString(R.string.helper_account_linked_meta, driverName, carNumber));
        binding.helperAvailableAmountText.setText(formatCurrency(helperAvailableBalance));
        binding.helperHistoryPreview.setText(buildCashoutPreview(cashouts));
        binding.helperCashoutButton.setEnabled(hasAssignedHelper);
        binding.helperHistoryCard.setEnabled(hasAssignedHelper);
        binding.helperHistoryCard.setAlpha(hasAssignedHelper ? 1f : 0.55f);
    }

    private void bindMissingHelperState() {
        hasAssignedHelper = false;
        helperAvailableBalance = 0;
        binding.helperNameText.setText(getString(R.string.helper_account_default_name));
        binding.helperMetaText.setText(getString(R.string.helper_account_no_helper_meta));
        binding.helperLinkedText.setText(getString(R.string.helper_account_no_helper_hint));
        binding.helperAvailableAmountText.setText(formatCurrency(0));
        binding.helperHistoryPreview.setText(getString(R.string.helper_account_no_helper_hint));
        binding.helperCashoutButton.setEnabled(false);
        binding.helperHistoryCard.setEnabled(false);
        binding.helperHistoryCard.setAlpha(0.55f);
    }

    private String buildCashoutPreview(JSONArray cashouts) {
        if (cashouts == null || cashouts.length() == 0) {
            return getString(R.string.account_history_empty_hint);
        }

        JSONObject latest = cashouts.optJSONObject(0);
        if (latest == null) {
            return getString(R.string.account_history_empty_hint);
        }

        return getString(
                R.string.helper_cashout_preview_format,
                formatCurrency(latest.optDouble("amount", 0)),
                formatStatus(latest.optString("status", "pending"))
        );
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

    private String formatCurrency(double value) {
        return String.format(Locale.US, "Rs %.0f", value);
    }

    private void setLoading(boolean loading) {
        binding.loadingOverlay.setVisibility(loading ? View.VISIBLE : View.GONE);
    }
}
