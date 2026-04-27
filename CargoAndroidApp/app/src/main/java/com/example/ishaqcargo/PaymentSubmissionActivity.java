package com.example.ishaqcargo;

import android.content.ContentResolver;
import android.net.Uri;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.example.ishaqcargo.databinding.ActivityPaymentSubmissionBinding;
import com.example.ishaqcargo.network.ApiClient;
import com.example.ishaqcargo.util.SessionManager;
import com.google.android.material.card.MaterialCardView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;

public class PaymentSubmissionActivity extends AppCompatActivity {

    private static final String STATE_PENDING_URI = "state_pending_uri";
    private static final String STATE_IMAGE_URI = "state_image_uri";

    private ActivityPaymentSubmissionBinding binding;
    private SessionManager sessionManager;
    private String baseUrl;
    private Uri pendingCameraUri;
    private Uri paymentScreenshotUri;

    private final ActivityResultLauncher<Uri> takeScreenshotLauncher = registerForActivityResult(
            new ActivityResultContracts.TakePicture(),
            success -> {
                if (success && pendingCameraUri != null) {
                    paymentScreenshotUri = pendingCameraUri;
                    binding.screenshotPreview.setImageURI(paymentScreenshotUri);
                    binding.screenshotPreview.setVisibility(View.VISIBLE);
                    binding.uploadHint.setText(R.string.payment_change_screenshot);
                } else {
                    pendingCameraUri = null;
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

        applyWindowInsets();
        restoreTransientState(savedInstanceState);
        setupTabs();

        binding.backButton.setOnClickListener(v -> finish());
        binding.uploadHint.setOnClickListener(v -> openCamera());
        binding.screenshotPreview.setOnClickListener(v -> openCamera());
        binding.submitButton.setOnClickListener(v -> submitPayment());
        binding.filterButton.setOnClickListener(v -> loadHistory(getInput(binding.monthFilterInput)));

        binding.monthFilterInput.setText(new SimpleDateFormat("yyyy-MM", Locale.US).format(new Date()));
        showTab(true);
        loadHistory(getInput(binding.monthFilterInput));
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        outState.putString(STATE_PENDING_URI, pendingCameraUri != null ? pendingCameraUri.toString() : null);
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

    private void setupTabs() {
        binding.newTabButton.setOnClickListener(v -> showTab(true));
        binding.historyTabButton.setOnClickListener(v -> showTab(false));
    }

    private void showTab(boolean showNewSubmission) {
        binding.newSubmissionContainer.setVisibility(showNewSubmission ? View.VISIBLE : View.GONE);
        binding.historyContainer.setVisibility(showNewSubmission ? View.GONE : View.VISIBLE);
        updateTabState(binding.newTabButton, showNewSubmission);
        updateTabState(binding.historyTabButton, !showNewSubmission);
    }

    private void openCamera() {
        try {
            pendingCameraUri = createTempImageUri("payment_");
            takeScreenshotLauncher.launch(pendingCameraUri);
        } catch (Exception exception) {
            Toast.makeText(this, R.string.unable_to_open_camera, Toast.LENGTH_SHORT).show();
        }
    }

    private Uri createTempImageUri(String prefix) throws IOException {
        File mediaDir = new File(getFilesDir(), "trip-media");
        if (!mediaDir.exists() && !mediaDir.mkdirs()) {
            throw new IOException("Unable to create media directory");
        }

        File imageFile = File.createTempFile(prefix + System.currentTimeMillis(), ".jpg", mediaDir);
        return FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", imageFile);
    }

    private void submitPayment() {
        String amount = getInput(binding.amountInput);
        if (TextUtils.isEmpty(amount)) {
            binding.amountInput.setError(getString(R.string.payment_amount_required));
            return;
        }

        if (paymentScreenshotUri == null) {
            Toast.makeText(this, R.string.payment_screenshot_required, Toast.LENGTH_SHORT).show();
            return;
        }

        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("amount", amount);

        setLoading(true);
        ContentResolver contentResolver = getContentResolver();
        ApiClient.submitCompanyPayment(baseUrl, sessionManager.getToken(), fields, paymentScreenshotUri, contentResolver, new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                runOnUiThread(() -> {
                    setLoading(false);
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
                        Toast.makeText(PaymentSubmissionActivity.this, message, Toast.LENGTH_LONG).show();
                    });
                    return;
                }

                runOnUiThread(() -> {
                    binding.amountInput.setText("");
                    paymentScreenshotUri = null;
                    pendingCameraUri = null;
                    binding.screenshotPreview.setVisibility(View.GONE);
                    binding.uploadHint.setText(R.string.payment_add_screenshot);
                    setLoading(false);
                    Toast.makeText(PaymentSubmissionActivity.this, R.string.payment_saved_successfully, Toast.LENGTH_SHORT).show();
                    showTab(false);
                    loadHistory(getInput(binding.monthFilterInput));
                });
            }
        });
    }

    private void loadHistory(String month) {
        setLoading(true);
        ApiClient.getCompanyPayments(baseUrl, sessionManager.getToken(), month, new Callback() {
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
                    JSONArray payments = root.optJSONArray("payments");
                    JSONObject summary = root.optJSONObject("summary");
                    runOnUiThread(() -> {
                        bindHistory(payments, summary);
                        setLoading(false);
                    });
                } catch (Exception exception) {
                    runOnUiThread(() -> setLoading(false));
                }
            }
        });
    }

    private void bindHistory(JSONArray payments, JSONObject summary) {
        int totalSubmissions = summary != null ? summary.optInt("total_submissions", 0) : 0;
        double totalAmount = summary != null ? summary.optDouble("total_amount", 0) : 0;
        binding.totalSubmissionsText.setText(getString(R.string.payment_total_submissions, String.valueOf(totalSubmissions)));
        binding.totalAmountText.setText(getString(R.string.payment_total_amount, formatCurrency(totalAmount)));
        binding.historyList.removeAllViews();

        if (payments == null || payments.length() == 0) {
            TextView emptyView = new TextView(this);
            emptyView.setText(R.string.payment_history_empty);
            emptyView.setTextColor(ContextCompat.getColor(this, R.color.section_hint));
            binding.historyList.addView(emptyView);
            return;
        }

        for (int index = 0; index < payments.length(); index++) {
            JSONObject item = payments.optJSONObject(index);
            if (item == null) {
                continue;
            }

            MaterialCardView card = new MaterialCardView(this);
            card.setCardBackgroundColor(ContextCompat.getColor(this, R.color.white));
            card.setStrokeColor(ContextCompat.getColor(this, R.color.card_stroke));
            card.setStrokeWidth(dpToPx(1));
            card.setRadius(dpToPx(18));

            LinearLayout layout = new LinearLayout(this);
            layout.setOrientation(LinearLayout.VERTICAL);
            int padding = dpToPx(14);
            layout.setPadding(padding, padding, padding, padding);

            TextView amountView = new TextView(this);
            amountView.setText(formatCurrency(item.optDouble("amount", 0)));
            amountView.setTextColor(ContextCompat.getColor(this, R.color.section_title));
            amountView.setTextSize(16f);

            TextView dateView = new TextView(this);
            dateView.setText(formatDateTime(item.optString("created_at", "")));
            dateView.setTextColor(ContextCompat.getColor(this, R.color.section_hint));
            dateView.setTextSize(12f);
            dateView.setPadding(0, dpToPx(4), 0, 0);

            TextView imageHint = new TextView(this);
            imageHint.setText(item.optString("screenshot_image", ""));
            imageHint.setTextColor(ContextCompat.getColor(this, R.color.button_primary));
            imageHint.setTextSize(12f);
            imageHint.setPadding(0, dpToPx(8), 0, 0);
            imageHint.setEllipsize(TextUtils.TruncateAt.END);
            imageHint.setMaxLines(1);

            layout.addView(amountView);
            layout.addView(dateView);
            layout.addView(imageHint);
            card.addView(layout);

            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
            );
            params.bottomMargin = dpToPx(10);
            card.setLayoutParams(params);

            binding.historyList.addView(card);
        }
    }

    private void restoreTransientState(Bundle savedInstanceState) {
        if (savedInstanceState == null) {
            return;
        }

        String pendingUri = savedInstanceState.getString(STATE_PENDING_URI);
        String imageUri = savedInstanceState.getString(STATE_IMAGE_URI);
        if (!TextUtils.isEmpty(pendingUri)) {
            pendingCameraUri = Uri.parse(pendingUri);
        }
        if (!TextUtils.isEmpty(imageUri)) {
            paymentScreenshotUri = Uri.parse(imageUri);
            binding.screenshotPreview.setImageURI(paymentScreenshotUri);
            binding.screenshotPreview.setVisibility(View.VISIBLE);
            binding.uploadHint.setText(R.string.payment_change_screenshot);
        }
    }

    private void setLoading(boolean loading) {
        binding.loadingOverlay.setVisibility(loading ? View.VISIBLE : View.GONE);
        binding.submitButton.setEnabled(!loading);
        binding.filterButton.setEnabled(!loading);
    }

    private int dpToPx(int dp) {
        return Math.round(dp * getResources().getDisplayMetrics().density);
    }

    private void updateTabState(com.google.android.material.button.MaterialButton button, boolean active) {
        button.setSelected(active);
        button.setAlpha(active ? 1f : 0.72f);
    }

    private String getInput(com.google.android.material.textfield.TextInputEditText input) {
        return input.getText() != null ? input.getText().toString().trim() : "";
    }

    private String formatCurrency(double amount) {
        return String.format(Locale.US, "Rs %.0f", amount);
    }

    private String formatDateTime(String value) {
        return value == null ? "-" : value.replace('T', ' ');
    }
}
