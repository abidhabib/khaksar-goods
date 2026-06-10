package com.example.ishaqcargo;

import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.example.ishaqcargo.databinding.ActivityDriverAccountBinding;
import com.example.ishaqcargo.network.ApiClient;
import com.example.ishaqcargo.util.SessionManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.util.Locale;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;

public class DriverAccountActivity extends AppCompatActivity {

    private ActivityDriverAccountBinding binding;
    private SessionManager sessionManager;
    private String baseUrl;
    private double availableBalance;
    private double commissionBalance;
    private double generateableCommissionAmount;
    private int generateableCommissionTripCount;
    private boolean generatingCommission;
    private final ActivityResultLauncher<Intent> cashoutLauncher = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            result -> {
                if (result.getResultCode() == RESULT_OK) {
                    fetchAccount();
                }
            }
    );

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        binding = ActivityDriverAccountBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());
        WindowCompat.getInsetsController(getWindow(), binding.getRoot()).setAppearanceLightStatusBars(true);

        sessionManager = new SessionManager(this);
        baseUrl = sessionManager.getBaseUrl();

        applyWindowInsets();
        setupActions();
        fetchAccount();
    }

    @Override
    protected void onResume() {
        super.onResume();
        fetchAccount();
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
            binding.swipeRefreshLayout.setProgressViewOffset(false, 0, topBarTopPadding + insets.top + 120);
            return windowInsets;
        });
    }

    private void setupActions() {
        binding.backButton.setOnClickListener(v -> finish());
        binding.availableCashoutButton.setOnClickListener(v ->
                openCashout(AccountCashoutActivity.MODE_DRIVER, AccountCashoutActivity.BALANCE_AVAILABLE, availableBalance));
        binding.commissionCashoutButton.setOnClickListener(v ->
                openCashout(AccountCashoutActivity.MODE_DRIVER, AccountCashoutActivity.BALANCE_COMMISSION, commissionBalance));
        binding.generateCommissionButton.setOnClickListener(v -> generateCommission());
        binding.cashoutHistoryCard.setOnClickListener(v ->
                startActivity(AccountHistoryActivity.newIntent(this, AccountHistoryActivity.MODE_DRIVER, AccountHistoryActivity.HISTORY_CASHOUT)));
        binding.commissionHistoryCard.setOnClickListener(v ->
                startActivity(AccountHistoryActivity.newIntent(this, AccountHistoryActivity.MODE_DRIVER, AccountHistoryActivity.HISTORY_COMMISSION)));
        binding.swipeRefreshLayout.setOnRefreshListener(this::fetchAccount);
    }

    private void openCashout(String mode, String balanceType, double balance) {
        cashoutLauncher.launch(AccountCashoutActivity.newIntent(this, mode, balanceType, balance));
    }

    private void fetchAccount() {
        String token = sessionManager.getToken();
        if (token == null) {
            return;
        }

        setLoading(true);
        ApiClient.getDriverAccount(baseUrl, token, new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                runOnUiThread(() -> {
                    setLoading(false);
                    Toast.makeText(DriverAccountActivity.this, R.string.driver_account_load_failed, Toast.LENGTH_SHORT).show();
                });
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String body = response.body() != null ? response.body().string() : "";
                if (!response.isSuccessful()) {
                    String message = ApiClient.parseErrorMessage(body, getString(R.string.driver_account_load_failed));
                    runOnUiThread(() -> {
                        setLoading(false);
                        Toast.makeText(DriverAccountActivity.this, message, Toast.LENGTH_SHORT).show();
                    });
                    return;
                }

                try {
                    JSONObject root = new JSONObject(body);
                    JSONObject account = root.optJSONObject("account");
                    JSONArray cashouts = root.optJSONArray("cashouts");
                    JSONArray commissions = root.optJSONArray("commissions");

                    runOnUiThread(() -> {
                        bindAccount(account, cashouts, commissions);
                        setLoading(false);
                    });
                } catch (Exception e) {
                    runOnUiThread(() -> {
                        setLoading(false);
                        Toast.makeText(DriverAccountActivity.this, R.string.driver_account_invalid_response, Toast.LENGTH_SHORT).show();
                    });
                }
            }
        });
    }

    private void bindAccount(JSONObject account, JSONArray cashouts, JSONArray commissions) {
        availableBalance = account != null ? account.optDouble("available_balance", 0) : 0;
        commissionBalance = account != null ? account.optDouble("commission_balance", 0) : 0;
        generateableCommissionAmount = account != null ? account.optDouble("generateable_commission_amount", 0) : 0;
        generateableCommissionTripCount = account != null ? account.optInt("generateable_commission_trip_count", 0) : 0;

        String fullName = account != null ? account.optString("full_name", getString(R.string.driver_account_default_name)) : getString(R.string.driver_account_default_name);
        String carNumber = account != null ? account.optString("car_number", getString(R.string.driver_account_no_car)) : getString(R.string.driver_account_no_car);
        double salaryAmount = account != null ? account.optDouble("salary_amount", 0) : 0;
        double commissionPercentage = account != null ? account.optDouble("commission_percentage", 0) : 0;

        binding.driverNameText.setText(fullName);
        binding.carNumberText.setText(carNumber);
        binding.accountMetaText.setText(getString(
                R.string.driver_account_meta,
                formatCurrency(salaryAmount),
                formatPercent(commissionPercentage)
        ));
        binding.availableAmountText.setText(formatCurrency(availableBalance));
        binding.commissionAmountText.setText(formatCurrency(commissionBalance));
        binding.cashoutHistoryPreview.setText(buildCashoutPreview(cashouts));
        binding.commissionHistoryPreview.setText(buildCommissionPreview(commissions));
        bindGenerateCommissionState();
    }

    private void bindGenerateCommissionState() {
        boolean hasGenerateableCommission = generateableCommissionAmount > 0 && generateableCommissionTripCount > 0;
        binding.generateCommissionButton.setEnabled(hasGenerateableCommission && !generatingCommission);
        CharSequence buttonText;
        if (generatingCommission) {
            buttonText = getString(R.string.generating_commission);
        } else if (hasGenerateableCommission) {
            buttonText = getString(R.string.generate_commission_button_format, formatCurrency(generateableCommissionAmount));
        } else {
            buttonText = getString(R.string.generate_commission_default);
        }
        binding.generateCommissionButton.setText(buttonText);
        binding.generateCommissionHintText.setText(
                hasGenerateableCommission
                        ? getString(
                                R.string.generate_commission_hint_format,
                                formatCurrency(generateableCommissionAmount),
                                String.valueOf(generateableCommissionTripCount)
                        )
                        : getString(R.string.generate_commission_empty)
        );
    }

    private void generateCommission() {
        if (generatingCommission || !(generateableCommissionAmount > 0) || generateableCommissionTripCount <= 0) {
            return;
        }

        String token = sessionManager.getToken();
        if (token == null) {
            return;
        }

        generatingCommission = true;
        bindGenerateCommissionState();

        ApiClient.generateDriverCommission(baseUrl, token, new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                runOnUiThread(() -> {
                    generatingCommission = false;
                    bindGenerateCommissionState();
                    Toast.makeText(DriverAccountActivity.this, R.string.commission_generate_failed, Toast.LENGTH_SHORT).show();
                });
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String body = response.body() != null ? response.body().string() : "";
                if (!response.isSuccessful()) {
                    String message = ApiClient.parseErrorMessage(body, getString(R.string.commission_generate_failed));
                    runOnUiThread(() -> {
                        generatingCommission = false;
                        bindGenerateCommissionState();
                        Toast.makeText(DriverAccountActivity.this, message, Toast.LENGTH_SHORT).show();
                    });
                    return;
                }

                runOnUiThread(() -> {
                    generatingCommission = false;
                    Toast.makeText(DriverAccountActivity.this, R.string.commission_generated_successfully, Toast.LENGTH_SHORT).show();
                    fetchAccount();
                });
            }
        });
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
                R.string.cashout_preview_format,
                formatBalanceType(latest.optString("balance_type", AccountCashoutActivity.BALANCE_AVAILABLE)),
                formatCurrency(latest.optDouble("amount", 0)),
                formatStatus(latest.optString("status", "pending"))
        );
    }

    private String buildCommissionPreview(JSONArray commissions) {
        if (commissions == null || commissions.length() == 0) {
            return getString(R.string.account_history_empty_hint);
        }

        JSONObject latest = commissions.optJSONObject(0);
        if (latest == null) {
            return getString(R.string.account_history_empty_hint);
        }

        return getString(
                R.string.commission_preview_format,
                latest.optInt("trip_id"),
                formatCurrency(latest.optDouble("commission_amount", 0)),
                formatStatus(latest.optString("status", "pending"))
        );
    }

    private String formatBalanceType(String balanceType) {
        if (AccountCashoutActivity.BALANCE_COMMISSION.equals(balanceType)) {
            return getString(R.string.driver_commission_balance);
        }
        return getString(R.string.driver_available_amount);
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

    private String formatPercent(double value) {
        return String.format(Locale.US, "%.0f%%", value);
    }

    private void setLoading(boolean loading) {
        binding.loadingOverlay.setVisibility(loading ? View.VISIBLE : View.GONE);
        binding.swipeRefreshLayout.setRefreshing(loading);
        if (!loading) {
            bindGenerateCommissionState();
        }
    }
}
