package com.example.ishaqcargo;

import android.app.Dialog;
import android.content.ContentResolver;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.example.ishaqcargo.databinding.ActivityPaymentSubmissionBinding;
import com.example.ishaqcargo.network.ApiClient;
import com.example.ishaqcargo.util.SessionManager;
import com.google.android.material.button.MaterialButton;
import com.google.android.material.textfield.TextInputEditText;

import org.json.JSONObject;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;

public class PaymentSubmissionActivity extends AppCompatActivity {

    private static final String METHOD_CASH = "cash";
    private static final String METHOD_ACCOUNT = "account";
    private static final String STATE_IMAGE_URI = "state_image_uri";

    private ActivityPaymentSubmissionBinding binding;
    private SessionManager sessionManager;
    private String baseUrl;
    private Uri paymentScreenshotUri;
    private Dialog activeAccountDialog;
    private TextView activeUploadHint;
    private ImageView activeScreenshotPreview;

    private final ActivityResultLauncher<String> pickScreenshotLauncher = registerForActivityResult(
            new ActivityResultContracts.GetContent(),
            uri -> {
                if (uri == null) {
                    return;
                }

                paymentScreenshotUri = uri;
                if (activeScreenshotPreview != null) {
                    activeScreenshotPreview.setImageURI(paymentScreenshotUri);
                    activeScreenshotPreview.setVisibility(View.VISIBLE);
                }
                if (activeUploadHint != null) {
                    activeUploadHint.setText(R.string.payment_change_screenshot_gallery);
                }
            }
    );

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        binding = ActivityPaymentSubmissionBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());
        WindowCompat.getInsetsController(getWindow(), binding.getRoot()).setAppearanceLightStatusBars(true);

        sessionManager = new SessionManager(this);
        baseUrl = sessionManager.getBaseUrl();

        restoreTransientState(savedInstanceState);
        applyWindowInsets();
        setupInteractions();
        loadOverview();
    }

    @Override
    protected void onResume() {
        super.onResume();
        loadOverview();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        outState.putString(STATE_IMAGE_URI, paymentScreenshotUri != null ? paymentScreenshotUri.toString() : null);
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

    private void setupInteractions() {
        binding.backButton.setOnClickListener(v -> finish());
        binding.cashMethodCard.setOnClickListener(v -> openCashDialog());
        binding.accountMethodCard.setOnClickListener(v -> openAccountDialog());
        binding.historyCard.setOnClickListener(v ->
                startActivity(new Intent(this, PaymentSubmissionHistoryActivity.class))
        );
    }

    private void openCashDialog() {
        Dialog dialog = new Dialog(this);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        dialog.setContentView(R.layout.dialog_payment_cash);
        dialog.setCancelable(true);

        TextInputEditText amountInput = dialog.findViewById(R.id.cashAmountInput);
        TextInputEditText handoverInput = dialog.findViewById(R.id.cashHandoverToInput);
        MaterialButton submitButton = dialog.findViewById(R.id.cashSubmitButton);

        submitButton.setOnClickListener(v -> {
            String amount = getInput(amountInput);
            String handoverTo = getInput(handoverInput);

            if (TextUtils.isEmpty(amount)) {
                amountInput.setError(getString(R.string.payment_amount_required));
                return;
            }

            if (TextUtils.isEmpty(handoverTo)) {
                handoverInput.setError(getString(R.string.payment_handover_required));
                return;
            }

            Map<String, String> fields = new LinkedHashMap<>();
            fields.put("payment_method", METHOD_CASH);
            fields.put("amount", amount);
            fields.put("handover_to", handoverTo);
            submitPayment(fields, null, dialog);
        });

        showDialog(dialog);
    }

    private void openAccountDialog() {
        Dialog dialog = new Dialog(this);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        dialog.setContentView(R.layout.dialog_payment_account);
        dialog.setCancelable(true);

        TextInputEditText amountInput = dialog.findViewById(R.id.accountAmountInput);
        TextInputEditText feeInput = dialog.findViewById(R.id.accountFeeInput);
        TextView uploadHint = dialog.findViewById(R.id.uploadHint);
        ImageView screenshotPreview = dialog.findViewById(R.id.screenshotPreview);
        MaterialButton submitButton = dialog.findViewById(R.id.accountSubmitButton);

        activeAccountDialog = dialog;
        activeUploadHint = uploadHint;
        activeScreenshotPreview = screenshotPreview;

        if (paymentScreenshotUri != null) {
            screenshotPreview.setImageURI(paymentScreenshotUri);
            screenshotPreview.setVisibility(View.VISIBLE);
            uploadHint.setText(R.string.payment_change_screenshot_gallery);
        } else {
            screenshotPreview.setVisibility(View.GONE);
            uploadHint.setText(R.string.payment_add_screenshot_gallery);
        }

        View.OnClickListener pickListener = v -> pickScreenshotLauncher.launch("image/*");
        uploadHint.setOnClickListener(pickListener);
        screenshotPreview.setOnClickListener(pickListener);

        submitButton.setOnClickListener(v -> {
            String amount = getInput(amountInput);
            String fee = getInput(feeInput);

            if (TextUtils.isEmpty(amount)) {
                amountInput.setError(getString(R.string.payment_amount_required));
                return;
            }

          

            if (paymentScreenshotUri == null) {
                Toast.makeText(this, R.string.payment_screenshot_required, Toast.LENGTH_SHORT).show();
                return;
            }

            Map<String, String> fields = new LinkedHashMap<>();
            fields.put("payment_method", METHOD_ACCOUNT);
            fields.put("amount", amount);
            fields.put("sending_fee", fee);
            submitPayment(fields, paymentScreenshotUri, dialog);
        });

        dialog.setOnDismissListener(d -> {
            activeAccountDialog = null;
            activeUploadHint = null;
            activeScreenshotPreview = null;
        });

        showDialog(dialog);
    }

    private void submitPayment(Map<String, String> fields, Uri screenshotUri, Dialog dialogToClose) {
        setLoading(true);
        setDialogSubmitting(dialogToClose, true);
        ContentResolver contentResolver = getContentResolver();
        ApiClient.submitCompanyPayment(
                baseUrl,
                sessionManager.getToken(),
                fields,
                screenshotUri,
                contentResolver,
                new Callback() {
                    @Override
                    public void onFailure(Call call, IOException e) {
                        runOnUiThread(() -> {
                            setLoading(false);
                            setDialogSubmitting(dialogToClose, false);
                            Toast.makeText(PaymentSubmissionActivity.this, R.string.unable_to_save_expense, Toast.LENGTH_LONG).show();
                        });
                    }

                    @Override
                    public void onResponse(Call call, Response response) throws IOException {
                        String body = response.body() != null ? response.body().string() : "";
                        if (!response.isSuccessful()) {
                            String message = ApiClient.parseErrorMessage(body, getString(R.string.unable_to_save_expense));
                            runOnUiThread(() -> {
                                setLoading(false);
                                setDialogSubmitting(dialogToClose, false);
                                Toast.makeText(PaymentSubmissionActivity.this, message, Toast.LENGTH_LONG).show();
                            });
                            return;
                        }

                        runOnUiThread(() -> {
                            paymentScreenshotUri = null;
                            if (dialogToClose != null && dialogToClose.isShowing()) {
                                dialogToClose.dismiss();
                            }
                            setLoading(false);
                            Toast.makeText(PaymentSubmissionActivity.this, R.string.payment_saved_successfully, Toast.LENGTH_SHORT).show();
                            loadOverview();
                        });
                    }
                }
        );
    }

    private void loadOverview() {
        setLoading(true);
        ApiClient.getCompanyPayments(baseUrl, sessionManager.getToken(), "", new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                runOnUiThread(() -> {
                    setLoading(false);
                    Toast.makeText(PaymentSubmissionActivity.this, R.string.unable_to_load_daily_expenses, Toast.LENGTH_LONG).show();
                });
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String body = response.body() != null ? response.body().string() : "";
                if (!response.isSuccessful()) {
                    String message = ApiClient.parseErrorMessage(body, getString(R.string.unable_to_load_daily_expenses));
                    runOnUiThread(() -> {
                        setLoading(false);
                        Toast.makeText(PaymentSubmissionActivity.this, message, Toast.LENGTH_LONG).show();
                    });
                    return;
                }

                try {
                    JSONObject root = new JSONObject(body);
                    JSONObject summary = root.optJSONObject("summary");
                    runOnUiThread(() -> {
                        bindOverview(summary);
                        setLoading(false);
                    });
                } catch (Exception exception) {
                    runOnUiThread(() -> setLoading(false));
                }
            }
        });
    }

    private void bindOverview(JSONObject summary) {
        double totalIncome = summary != null ? summary.optDouble("total_income", 0) : 0;
        double totalApprovedDeposit = summary != null ? summary.optDouble("total_approved_amount", 0) : 0;
        binding.totalIncomeValueText.setText(formatCurrency(totalIncome));
        binding.totalSubmittedValueText.setText(formatCurrency(totalApprovedDeposit));
    }

    private void showDialog(Dialog dialog) {
        dialog.show();
        if (dialog.getWindow() != null) {
            dialog.getWindow().setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        }
    }

    private void setDialogSubmitting(Dialog dialog, boolean loading) {
        if (dialog == null) {
            return;
        }

        MaterialButton cashSubmitButton = dialog.findViewById(R.id.cashSubmitButton);
        MaterialButton accountSubmitButton = dialog.findViewById(R.id.accountSubmitButton);
        TextInputEditText cashAmountInput = dialog.findViewById(R.id.cashAmountInput);
        TextInputEditText cashHandoverInput = dialog.findViewById(R.id.cashHandoverToInput);
        TextInputEditText accountAmountInput = dialog.findViewById(R.id.accountAmountInput);
        TextInputEditText accountFeeInput = dialog.findViewById(R.id.accountFeeInput);
        TextView uploadHint = dialog.findViewById(R.id.uploadHint);
        ImageView screenshotPreview = dialog.findViewById(R.id.screenshotPreview);
        LinearLayout cashSavingState = dialog.findViewById(R.id.cashSavingState);
        LinearLayout accountSavingState = dialog.findViewById(R.id.accountSavingState);

        if (cashSubmitButton != null) {
            cashSubmitButton.setEnabled(!loading);
            cashSubmitButton.setText(loading ? R.string.saving_submission : R.string.save_payment_submission);
        }
        if (accountSubmitButton != null) {
            accountSubmitButton.setEnabled(!loading);
            accountSubmitButton.setText(loading ? R.string.saving_submission : R.string.save_payment_submission);
        }
        if (cashAmountInput != null) cashAmountInput.setEnabled(!loading);
        if (cashHandoverInput != null) cashHandoverInput.setEnabled(!loading);
        if (accountAmountInput != null) accountAmountInput.setEnabled(!loading);
        if (accountFeeInput != null) accountFeeInput.setEnabled(!loading);
        if (uploadHint != null) uploadHint.setEnabled(!loading);
        if (screenshotPreview != null) screenshotPreview.setEnabled(!loading);
        if (cashSavingState != null) cashSavingState.setVisibility(loading ? View.VISIBLE : View.GONE);
        if (accountSavingState != null) accountSavingState.setVisibility(loading ? View.VISIBLE : View.GONE);
    }

    private void restoreTransientState(Bundle savedInstanceState) {
        if (savedInstanceState == null) {
            return;
        }

        String imageUri = savedInstanceState.getString(STATE_IMAGE_URI);
        if (!TextUtils.isEmpty(imageUri)) {
            paymentScreenshotUri = Uri.parse(imageUri);
        }
    }

    private void setLoading(boolean loading) {
        binding.loadingOverlay.setVisibility(loading ? View.VISIBLE : View.GONE);
        binding.cashMethodCard.setEnabled(!loading);
        binding.accountMethodCard.setEnabled(!loading);
        binding.historyCard.setEnabled(!loading);
    }

    private String getInput(TextInputEditText input) {
        return input.getText() != null ? input.getText().toString().trim() : "";
    }

    private String formatCurrency(double amount) {
        return String.format(Locale.US, "Rs %.0f", amount);
    }
}
