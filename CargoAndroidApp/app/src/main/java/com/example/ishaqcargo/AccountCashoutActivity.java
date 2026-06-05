package com.example.ishaqcargo;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.example.ishaqcargo.databinding.ActivityAccountCashoutBinding;
import com.example.ishaqcargo.network.ApiClient;
import com.example.ishaqcargo.util.SessionManager;
import com.google.android.material.card.MaterialCardView;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;

public class AccountCashoutActivity extends AppCompatActivity {

    public static final String MODE_DRIVER = "driver";
    public static final String MODE_HELPER = "helper";
    public static final String BALANCE_AVAILABLE = "available";
    public static final String BALANCE_COMMISSION = "commission";

    private static final String EXTRA_MODE = "mode";
    private static final String EXTRA_BALANCE_TYPE = "balance_type";
    private static final String EXTRA_CURRENT_BALANCE = "current_balance";

    private ActivityAccountCashoutBinding binding;
    private SessionManager sessionManager;
    private String baseUrl;
    private String mode;
    private String balanceType;
    private double currentBalance;
    private String receiveMethod = "cash";

    public static Intent newIntent(Context context, String mode, String balanceType, double currentBalance) {
        Intent intent = new Intent(context, AccountCashoutActivity.class);
        intent.putExtra(EXTRA_MODE, mode);
        intent.putExtra(EXTRA_BALANCE_TYPE, balanceType);
        intent.putExtra(EXTRA_CURRENT_BALANCE, currentBalance);
        return intent;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        binding = ActivityAccountCashoutBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());
        WindowCompat.getInsetsController(getWindow(), binding.getRoot()).setAppearanceLightStatusBars(true);

        sessionManager = new SessionManager(this);
        baseUrl = sessionManager.getBaseUrl();

        mode = getIntent().getStringExtra(EXTRA_MODE);
        balanceType = getIntent().getStringExtra(EXTRA_BALANCE_TYPE);
        currentBalance = getIntent().getDoubleExtra(EXTRA_CURRENT_BALANCE, 0);

        if (!MODE_HELPER.equals(mode)) {
            mode = MODE_DRIVER;
        }
        if (!BALANCE_COMMISSION.equals(balanceType)) {
            balanceType = BALANCE_AVAILABLE;
        }
        if (MODE_HELPER.equals(mode)) {
            balanceType = BALANCE_AVAILABLE;
        }

        applyWindowInsets();
        setupScreen();
        setupActions();
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

    private void setupScreen() {
        binding.backButton.setOnClickListener(v -> finish());
        binding.screenTitle.setText(getString(R.string.cash_out));
        binding.screenSubtitle.setText(getSubtitleText());
        binding.accountSourceText.setText(getBalanceTitle());
        binding.availableNowText.setText(getString(R.string.available_now_format, formatCurrency(currentBalance)));

        ArrayAdapter<String> bankAdapter = new ArrayAdapter<>(
                this,
                android.R.layout.simple_spinner_dropdown_item,
                new String[]{"Easypaisa", "JazzCash", "HBL", "OTHER"}
        );
        binding.bankNameSpinner.setAdapter(bankAdapter);

        updateReceiveMethodUi();
        updateAccountFieldsVisibility();
    }

    private void setupActions() {
        binding.cashMethodCard.setOnClickListener(v -> setReceiveMethod("cash"));
        binding.accountMethodCard.setOnClickListener(v -> setReceiveMethod("account"));
        binding.submitButton.setOnClickListener(v -> submitCashoutRequest());
    }

    private void setReceiveMethod(String method) {
        receiveMethod = method;
        updateReceiveMethodUi();
        updateAccountFieldsVisibility();
    }

    private void updateReceiveMethodUi() {
        updateMethodCard(
                binding.cashMethodCard,
                binding.cashMethodTitle,
                binding.cashMethodSubtitle,
                "cash".equals(receiveMethod)
        );
        updateMethodCard(
                binding.accountMethodCard,
                binding.accountMethodTitle,
                binding.accountMethodSubtitle,
                "account".equals(receiveMethod)
        );
    }

    private void updateMethodCard(MaterialCardView card, android.widget.TextView title, android.widget.TextView subtitle, boolean selected) {
        int backgroundColor = getColor(selected ? R.color.trips_widget_bg : R.color.white);
        int strokeColor = getColor(selected ? R.color.trips_widget_text : R.color.card_stroke);
        int titleColor = getColor(selected ? R.color.trips_widget_text : R.color.section_title);
        int subtitleColor = getColor(selected ? R.color.trips_widget_text : R.color.section_hint);

        card.setCardBackgroundColor(backgroundColor);
        card.setStrokeColor(strokeColor);
        card.setStrokeWidth(selected ? 2 : 1);
        title.setTextColor(titleColor);
        subtitle.setTextColor(subtitleColor);
    }

    private void updateAccountFieldsVisibility() {
        int visibility = "account".equals(receiveMethod) ? View.VISIBLE : View.GONE;
        binding.accountFieldsCard.setVisibility(visibility);
    }

    private void submitCashoutRequest() {
        String amount = binding.amountInput.getText() != null ? binding.amountInput.getText().toString().trim() : "";
        if (TextUtils.isEmpty(amount)) {
            Toast.makeText(this, R.string.amount_required, Toast.LENGTH_SHORT).show();
            return;
        }

        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("amount", amount);
        fields.put("receive_method", receiveMethod);

        if (MODE_DRIVER.equals(mode)) {
            fields.put("balance_type", balanceType);
        }

        if ("account".equals(receiveMethod)) {
            String accountNumber = binding.accountNumberInput.getText() != null ? binding.accountNumberInput.getText().toString().trim() : "";
            String accountName = binding.accountNameInput.getText() != null ? binding.accountNameInput.getText().toString().trim() : "";
            String bankName = String.valueOf(binding.bankNameSpinner.getSelectedItem());

            if (TextUtils.isEmpty(accountNumber) || TextUtils.isEmpty(accountName) || TextUtils.isEmpty(bankName)) {
                Toast.makeText(this, R.string.account_cashout_details_required, Toast.LENGTH_SHORT).show();
                return;
            }

            fields.put("account_number", accountNumber);
            fields.put("account_name", accountName);
            fields.put("bank_name", bankName);
        }

        setLoading(true);
        Callback callback = new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                runOnUiThread(() -> {
                    setLoading(false);
                    Toast.makeText(AccountCashoutActivity.this, R.string.cashout_submit_failed, Toast.LENGTH_SHORT).show();
                });
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String body = response.body() != null ? response.body().string() : "";
                if (!response.isSuccessful()) {
                    String message = ApiClient.parseErrorMessage(body, getString(R.string.cashout_submit_failed));
                    runOnUiThread(() -> {
                        setLoading(false);
                        Toast.makeText(AccountCashoutActivity.this, message, Toast.LENGTH_SHORT).show();
                    });
                    return;
                }

                runOnUiThread(() -> {
                    setLoading(false);
                    Toast.makeText(AccountCashoutActivity.this, R.string.cashout_submit_success, Toast.LENGTH_SHORT).show();
                    setResult(RESULT_OK);
                    finish();
                });
            }
        };

        if (MODE_HELPER.equals(mode)) {
            ApiClient.submitHelperCashoutRequest(baseUrl, sessionManager.getToken(), fields, callback);
        } else {
            ApiClient.submitDriverCashoutRequest(baseUrl, sessionManager.getToken(), fields, callback);
        }
    }

    private String getSubtitleText() {
        if (MODE_HELPER.equals(mode)) {
            return getString(R.string.helper_cashout_subtitle);
        }
        if (BALANCE_COMMISSION.equals(balanceType)) {
            return getString(R.string.driver_commission_cashout_subtitle);
        }
        return getString(R.string.driver_available_cashout_subtitle);
    }

    private String getBalanceTitle() {
        if (MODE_HELPER.equals(mode)) {
            return getString(R.string.helper_available_amount);
        }
        if (BALANCE_COMMISSION.equals(balanceType)) {
            return getString(R.string.driver_commission_balance);
        }
        return getString(R.string.driver_available_amount);
    }

    private String formatCurrency(double value) {
        return String.format(Locale.US, "Rs %.0f", value);
    }

    private void setLoading(boolean loading) {
        binding.loadingOverlay.setVisibility(loading ? View.VISIBLE : View.GONE);
        binding.submitButton.setEnabled(!loading);
    }
}
