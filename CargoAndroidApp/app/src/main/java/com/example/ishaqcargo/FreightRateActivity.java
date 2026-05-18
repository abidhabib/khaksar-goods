package com.example.ishaqcargo;

import android.os.Bundle;
import android.text.TextUtils;
import android.view.View;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.example.ishaqcargo.databinding.ActivityFreightRateBinding;
import com.example.ishaqcargo.network.ApiClient;
import com.example.ishaqcargo.util.SessionManager;

import org.json.JSONObject;

import java.io.IOException;
import java.util.Locale;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;

public class FreightRateActivity extends AppCompatActivity {

    private ActivityFreightRateBinding binding;
    private SessionManager sessionManager;
    private String baseUrl;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        binding = ActivityFreightRateBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());
        WindowCompat.getInsetsController(getWindow(), binding.getRoot()).setAppearanceLightStatusBars(true);

        sessionManager = new SessionManager(this);
        baseUrl = sessionManager.getBaseUrl();
        applyWindowInsets();

        binding.backButton.setOnClickListener(v -> finish());
        binding.calculateButton.setOnClickListener(v -> calculateRate());
    }

    private void applyWindowInsets() {
        final int topBarLeft = binding.topBar.getPaddingLeft();
        final int topBarTop = binding.topBar.getPaddingTop();
        final int topBarRight = binding.topBar.getPaddingRight();
        final int topBarBottom = binding.topBar.getPaddingBottom();
        final int contentLeft = binding.contentScroll.getPaddingLeft();
        final int contentTop = binding.contentScroll.getPaddingTop();
        final int contentRight = binding.contentScroll.getPaddingRight();
        final int contentBottom = binding.contentScroll.getPaddingBottom();

        ViewCompat.setOnApplyWindowInsetsListener(binding.getRoot(), (view, windowInsets) -> {
            Insets insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            binding.topBar.setPadding(
                    topBarLeft,
                    topBarTop + insets.top + 8,
                    topBarRight,
                    topBarBottom
            );
            binding.contentScroll.setPadding(
                    contentLeft,
                    contentTop,
                    contentRight,
                    contentBottom + insets.bottom
            );
            return windowInsets;
        });
    }

    private void calculateRate() {
        String token = sessionManager.getToken();
        String weightTon = binding.weightInput.getText() != null ? binding.weightInput.getText().toString().trim() : "";
        String distanceKm = binding.distanceInput.getText() != null ? binding.distanceInput.getText().toString().trim() : "";

        if (TextUtils.isEmpty(weightTon)) {
            binding.weightInput.setError(getString(R.string.freight_weight_required));
            binding.weightInput.requestFocus();
            return;
        }

        if (TextUtils.isEmpty(distanceKm)) {
            binding.distanceInput.setError(getString(R.string.freight_distance_required));
            binding.distanceInput.requestFocus();
            return;
        }

        binding.weightInput.setError(null);
        binding.distanceInput.setError(null);
        setLoading(true);

        ApiClient.getFreightRateEstimate(baseUrl, token, weightTon, distanceKm, new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                runOnUiThread(() -> {
                    setLoading(false);
                    Toast.makeText(FreightRateActivity.this, R.string.freight_load_failed, Toast.LENGTH_LONG).show();
                });
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String body = response.body() != null ? response.body().string() : "";

                if (!response.isSuccessful()) {
                    String message = ApiClient.parseErrorMessage(body, getString(R.string.freight_load_failed));
                    runOnUiThread(() -> {
                        setLoading(false);
                        Toast.makeText(FreightRateActivity.this, message, Toast.LENGTH_LONG).show();
                    });
                    return;
                }

                try {
                    JSONObject root = new JSONObject(body);
                    JSONObject estimate = root.optJSONObject("estimate");

                    if (estimate == null) {
                        throw new IllegalStateException("Missing estimate");
                    }

                    runOnUiThread(() -> {
                        setLoading(false);
                        bindEstimate(estimate);
                    });
                } catch (Exception e) {
                    runOnUiThread(() -> {
                        setLoading(false);
                        Toast.makeText(FreightRateActivity.this, R.string.freight_invalid_response, Toast.LENGTH_LONG).show();
                    });
                }
            }
        });
    }

    private void bindEstimate(JSONObject estimate) {
        double appliedRatePerKm = estimate.optDouble("applied_rate_per_km", 0);
        double totalFreight = estimate.optDouble("total_freight_charge", 0);
        double requestedWeight = estimate.optDouble("requested_weight_ton", 0);
        double requestedDistance = estimate.optDouble("requested_distance_km", 0);
        String mode = estimate.optString("calculation_mode", "-");

        binding.resultSummary.setText(getString(
                R.string.freight_result_summary,
                formatNumber(requestedWeight),
                formatNumber(requestedDistance)
        ));
        binding.resultRate.setText(getString(R.string.freight_result_rate, formatNumber(appliedRatePerKm)));
        binding.resultTotal.setText(getString(R.string.freight_result_total, formatNumber(totalFreight)));
        binding.resultCard.setVisibility(View.VISIBLE);
    }

    private void setLoading(boolean loading) {
        binding.progressBar.setVisibility(loading ? View.VISIBLE : View.GONE);
        binding.calculateButton.setEnabled(!loading);
        binding.calculateButton.setText(loading ? R.string.freight_calculation_loading : R.string.freight_calculate_button);
    }

    private String formatNumber(double value) {
        return String.format(Locale.US, "%.2f", value).replaceAll("\\.?0+$", "");
    }
}
