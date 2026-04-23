package com.example.ishaqcargo;

import android.util.Log;
import android.net.Uri;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.View;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.example.ishaqcargo.databinding.ActivityStartTripBinding;
import com.example.ishaqcargo.network.ApiClient;
import com.example.ishaqcargo.util.SessionManager;

import org.json.JSONObject;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;

public class StartTripActivity extends AppCompatActivity {

    private static final String TAG = "StartTripActivity";

    private ActivityStartTripBinding binding;
    private SessionManager sessionManager;
    private Uri meterImageUri;
    private String baseUrl;

    private final ActivityResultLauncher<String> pickImageLauncher = registerForActivityResult(
            new ActivityResultContracts.GetContent(),
            uri -> {
                if (uri != null) {
                    meterImageUri = uri;
                    binding.startMeterImagePreview.setImageURI(uri);
                    binding.startMeterImagePreview.setVisibility(View.VISIBLE);
                    binding.startUploadHint.setText(R.string.start_trip_change_photo);
                }
            }
    );

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        binding = ActivityStartTripBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());
        WindowCompat.getInsetsController(getWindow(), binding.getRoot()).setAppearanceLightStatusBars(true);

        sessionManager = new SessionManager(this);
        baseUrl = sessionManager.getBaseUrl();

        applyWindowInsets();

        binding.backButton.setOnClickListener(v -> finish());
        binding.startMeterImagePreview.setOnClickListener(v -> pickImageLauncher.launch("image/*"));
        binding.startUploadHint.setOnClickListener(v -> pickImageLauncher.launch("image/*"));
        binding.submitTripButton.setOnClickListener(v -> submitTrip());
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

    private void submitTrip() {
        String from = getInput(binding.startFromInput);
        String to = getInput(binding.startToInput);
        String freight = getInput(binding.startFreightInput);
        String meter = getInput(binding.startMeterInput);
        String token = sessionManager.getToken();

        if (TextUtils.isEmpty(from) || TextUtils.isEmpty(to) || TextUtils.isEmpty(freight) || TextUtils.isEmpty(meter)) {
            Toast.makeText(this, "Please fill all required fields", Toast.LENGTH_SHORT).show();
            return;
        }

        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("from_location", from);
        fields.put("to_location", to);
        fields.put("freight_charge", freight);
        fields.put("meter_reading", meter);

        setSubmitting(true);

        ApiClient.startTrip(baseUrl, token, fields, meterImageUri, getContentResolver(), new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                Log.e(TAG, "Start trip request failed", e);
                runOnUiThread(() -> {
                    setSubmitting(false);
                    String message = e.getMessage() != null && !e.getMessage().trim().isEmpty()
                            ? "Unable to start trip: " + e.getMessage()
                            : "Unable to start trip";
                    Toast.makeText(StartTripActivity.this, message, Toast.LENGTH_LONG).show();
                });
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String body = response.body() != null ? response.body().string() : "";

                if (!response.isSuccessful()) {
                    String message = ApiClient.parseErrorMessage(body, "Failed to start trip");
                    runOnUiThread(() -> {
                        setSubmitting(false);
                        Toast.makeText(StartTripActivity.this, message, Toast.LENGTH_LONG).show();
                    });
                    return;
                }

                String routeText = from + " to " + to;
                runOnUiThread(() -> showSuccess(routeText));
            }
        });
    }

    private void showSuccess(String routeText) {
        setSubmitting(false);
        binding.successRouteText.setText(routeText);
        binding.successState.setVisibility(View.VISIBLE);
        binding.submitTripButton.setVisibility(View.GONE);
        binding.formCard.setVisibility(View.GONE);
        binding.successCloseButton.setOnClickListener(v -> {
            setResult(RESULT_OK);
            finish();
        });
    }

    private void setSubmitting(boolean submitting) {
        binding.loadingOverlay.setVisibility(submitting ? View.VISIBLE : View.GONE);
        binding.submitTripButton.setEnabled(!submitting);
        binding.backButton.setEnabled(!submitting);
    }

    private String getInput(com.google.android.material.textfield.TextInputEditText input) {
        return input.getText() != null ? input.getText().toString().trim() : "";
    }
}
