package com.example.ishaqcargo;

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

import com.example.ishaqcargo.databinding.ActivityEndTripBinding;
import com.example.ishaqcargo.network.ApiClient;
import com.example.ishaqcargo.util.SessionManager;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;

public class EndTripActivity extends AppCompatActivity {

    public static final String EXTRA_TRIP_ID = "trip_id";
    public static final String EXTRA_ROUTE = "trip_route";

    private ActivityEndTripBinding binding;
    private SessionManager sessionManager;
    private String baseUrl;
    private Uri meterImageUri;
    private String tripId;

    private final ActivityResultLauncher<String> pickImageLauncher = registerForActivityResult(
            new ActivityResultContracts.GetContent(),
            uri -> {
                if (uri != null) {
                    meterImageUri = uri;
                    binding.endMeterImagePreview.setImageURI(uri);
                    binding.endMeterImagePreview.setVisibility(View.VISIBLE);
                    binding.endUploadHint.setText(R.string.end_trip_change_photo);
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

        applyWindowInsets();
        binding.routeSummary.setText(getIntent().getStringExtra(EXTRA_ROUTE));
        binding.backButton.setOnClickListener(v -> finish());
        binding.endMeterImagePreview.setOnClickListener(v -> pickImageLauncher.launch("image/*"));
        binding.endUploadHint.setOnClickListener(v -> pickImageLauncher.launch("image/*"));
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
        String meter = getInput(binding.endMeterInput);
        if (TextUtils.isEmpty(tripId) || TextUtils.isEmpty(meter)) {
            Toast.makeText(this, "End meter reading is required", Toast.LENGTH_SHORT).show();
            return;
        }

        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("meter_reading", meter);
        fields.put("diesel_cost", getNumericInput(binding.dieselCostInput));
        fields.put("toll_cost", getNumericInput(binding.tollCostInput));
        fields.put("food_cost", getNumericInput(binding.foodCostInput));
        fields.put("other_cost", getNumericInput(binding.otherCostInput));
        fields.put("notes", getInput(binding.notesInput));

        setSubmitting(true);

        ApiClient.endTrip(baseUrl, sessionManager.getToken(), tripId, fields, meterImageUri, getContentResolver(), new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                runOnUiThread(() -> {
                    setSubmitting(false);
                    Toast.makeText(EndTripActivity.this, "Unable to end trip", Toast.LENGTH_LONG).show();
                });
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String body = response.body() != null ? response.body().string() : "";

                if (!response.isSuccessful()) {
                    String message = ApiClient.parseErrorMessage(body, "Failed to end trip");
                    runOnUiThread(() -> {
                        setSubmitting(false);
                        Toast.makeText(EndTripActivity.this, message, Toast.LENGTH_LONG).show();
                    });
                    return;
                }

                runOnUiThread(() -> showSuccess());
            }
        });
    }

    private void showSuccess() {
        setSubmitting(false);
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

    private String getNumericInput(com.google.android.material.textfield.TextInputEditText input) {
        String value = getInput(input);
        return TextUtils.isEmpty(value) ? "0" : value;
    }
}
