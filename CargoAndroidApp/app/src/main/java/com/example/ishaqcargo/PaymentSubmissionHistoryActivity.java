package com.example.ishaqcargo;

import android.app.Dialog;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
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

import com.bumptech.glide.Glide;
import com.example.ishaqcargo.databinding.ActivityPaymentSubmissionHistoryBinding;
import com.example.ishaqcargo.network.ApiClient;
import com.example.ishaqcargo.util.SessionManager;
import com.google.android.material.card.MaterialCardView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;

public class PaymentSubmissionHistoryActivity extends AppCompatActivity {

    private ActivityPaymentSubmissionHistoryBinding binding;
    private SessionManager sessionManager;
    private String baseUrl;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        binding = ActivityPaymentSubmissionHistoryBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());
        WindowCompat.getInsetsController(getWindow(), binding.getRoot()).setAppearanceLightStatusBars(true);

        sessionManager = new SessionManager(this);
        baseUrl = sessionManager.getBaseUrl();

        applyWindowInsets();
        setupInteractions();

        binding.monthFilterInput.setText(new SimpleDateFormat("yyyy-MM", Locale.US).format(new Date()));
        loadHistory();
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
        binding.filterButton.setOnClickListener(v -> loadHistory());
        binding.swipeRefreshLayout.setOnRefreshListener(this::loadHistory);
    }

    private void loadHistory() {
        setLoading(true);
        ApiClient.getCompanyPayments(baseUrl, sessionManager.getToken(), getInput(binding.monthFilterInput), new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                runOnUiThread(() -> {
                    setLoading(false);
                    Toast.makeText(PaymentSubmissionHistoryActivity.this, R.string.unable_to_load_daily_expenses, Toast.LENGTH_LONG).show();
                });
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String body = response.body() != null ? response.body().string() : "";
                if (!response.isSuccessful()) {
                    String message = ApiClient.parseErrorMessage(body, getString(R.string.unable_to_load_daily_expenses));
                    runOnUiThread(() -> {
                        setLoading(false);
                        Toast.makeText(PaymentSubmissionHistoryActivity.this, message, Toast.LENGTH_LONG).show();
                    });
                    return;
                }

                try {
                    JSONObject root = new JSONObject(body);
                    JSONArray payments = root.optJSONArray("payments");
                    JSONObject historySummary = root.optJSONObject("historySummary");
                    runOnUiThread(() -> {
                        bindHistory(payments, historySummary);
                        setLoading(false);
                    });
                } catch (Exception exception) {
                    runOnUiThread(() -> setLoading(false));
                }
            }
        });
    }

    private void bindHistory(JSONArray payments, JSONObject historySummary) {
        int totalSubmissions = historySummary != null ? historySummary.optInt("total_submissions", 0) : 0;
        double totalAmount = historySummary != null ? historySummary.optDouble("total_amount", 0) : 0;
        binding.totalSubmissionsText.setText(getString(R.string.payment_total_submissions, String.valueOf(totalSubmissions)));
        binding.totalAmountText.setText(getString(R.string.payment_total_amount, formatCurrency(totalAmount)));
        binding.historyList.removeAllViews();

        if (payments == null || payments.length() == 0) {
            TextView emptyView = new TextView(this);
            emptyView.setText(R.string.payment_history_empty);
            emptyView.setTextColor(ContextCompat.getColor(this, R.color.section_hint));
            emptyView.setTextSize(14f);
            emptyView.setPadding(dpToPx(16), dpToPx(32), dpToPx(16), dpToPx(32));
            emptyView.setGravity(Gravity.CENTER);
            binding.historyList.addView(emptyView);
            return;
        }

        for (int index = 0; index < payments.length(); index++) {
            JSONObject item = payments.optJSONObject(index);
            if (item == null) {
                continue;
            }

            boolean isCash = "cash".equalsIgnoreCase(item.optString("payment_method"));
            MaterialCardView card = new MaterialCardView(this);
            card.setCardBackgroundColor(ContextCompat.getColor(this, isCash ? R.color.history_card : R.color.white));
            card.setStrokeColor(ContextCompat.getColor(this, isCash ? R.color.history_stroke : R.color.card_stroke));
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
            amountView.setTypeface(null, Typeface.BOLD);

            layout.addView(amountView);
            layout.addView(buildMetaText(getString(
                    R.string.payment_method_label,
                    item.optString("payment_method", "account").toUpperCase(Locale.US)
            )));
            layout.addView(buildMetaText(getString(
                    R.string.payment_status_label,
                    item.optString("status", "pending").toUpperCase(Locale.US)
            )));

            if (isCash) {
                layout.addView(buildMetaText(getString(
                        R.string.payment_handover_label,
                        item.optString("handover_to", "-")
                )));
            } else {
                layout.addView(buildMetaText(getString(
                        R.string.payment_fee_label,
                        formatCurrency(item.optDouble("sending_fee", 0))
                )));
            }

            layout.addView(buildMetaText(getString(
                    R.string.payment_submission_date_label,
                    formatDateTime(item.optString("submitted_at", ""))
            )));
            layout.addView(buildMetaText(getString(
                    R.string.payment_status_date_label,
                    formatDateTime(item.optString("status_updated_at", ""))
            )));

            String imageUrl = item.optString("screenshot_image", "");
            if (!TextUtils.isEmpty(imageUrl)) {
                ImageView screenshotThumb = new ImageView(this);
                screenshotThumb.setLayoutParams(new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        dpToPx(160)
                ));
                screenshotThumb.setScaleType(ImageView.ScaleType.CENTER_CROP);
                screenshotThumb.setBackgroundColor(ContextCompat.getColor(this, R.color.image_placeholder));
                screenshotThumb.setPadding(0, dpToPx(8), 0, 0);

                String fullImageUrl = imageUrl.startsWith("http") ? imageUrl : baseUrl + imageUrl;
                Glide.with(this)
                        .load(fullImageUrl)
                        .placeholder(R.color.image_placeholder)
                        .error(R.color.image_placeholder)
                        .into(screenshotThumb);
                screenshotThumb.setOnClickListener(v -> showImageModal(fullImageUrl));
                layout.addView(screenshotThumb);
            }

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

    private TextView buildMetaText(String text) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextColor(ContextCompat.getColor(this, R.color.section_hint));
        view.setTextSize(12f);
        view.setPadding(0, dpToPx(4), 0, 0);
        return view;
    }

    private void showImageModal(String imageUrl) {
        Dialog dialog = new Dialog(this, android.R.style.Theme_Black_NoTitleBar_Fullscreen);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);

        ImageView imageView = new ImageView(this);
        imageView.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        imageView.setScaleType(ImageView.ScaleType.FIT_CENTER);
        imageView.setBackgroundColor(Color.BLACK);
        imageView.setOnClickListener(v -> dialog.dismiss());

        Glide.with(this)
                .load(imageUrl)
                .placeholder(R.color.image_placeholder)
                .error(R.color.image_placeholder)
                .into(imageView);

        dialog.setContentView(imageView);
        if (dialog.getWindow() != null) {
            dialog.getWindow().setBackgroundDrawable(new ColorDrawable(Color.BLACK));
            dialog.getWindow().setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        }
        dialog.show();
    }

    private void setLoading(boolean loading) {
        binding.loadingOverlay.setVisibility(loading ? View.VISIBLE : View.GONE);
        binding.filterButton.setEnabled(!loading);
        binding.swipeRefreshLayout.setRefreshing(loading);
    }

    private String getInput(com.google.android.material.textfield.TextInputEditText input) {
        return input.getText() != null ? input.getText().toString().trim() : "";
    }

    private int dpToPx(int dp) {
        return Math.round(dp * getResources().getDisplayMetrics().density);
    }

    private String formatCurrency(double amount) {
        return String.format(Locale.US, "Rs %.0f", amount);
    }

    private String formatDateTime(String value) {
        if (TextUtils.isEmpty(value)) {
            return "-";
        }

        String normalized = value.replace(' ', 'T');
        SimpleDateFormat[] parsers = {
                new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US),
                new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SS'Z'", Locale.US),
                new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US),
                new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US),
                new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US)
        };

        for (SimpleDateFormat parser : parsers) {
            parser.setTimeZone(TimeZone.getTimeZone("UTC"));
            try {
                Date date = parser.parse(normalized);
                if (date != null) {
                    SimpleDateFormat outputFormat = new SimpleDateFormat("dd MMM yyyy, hh:mm a", Locale.US);
                    outputFormat.setTimeZone(TimeZone.getDefault());
                    return outputFormat.format(date);
                }
            } catch (ParseException ignored) {
            }
        }

        return normalized.replace('T', ' ');
    }
}
