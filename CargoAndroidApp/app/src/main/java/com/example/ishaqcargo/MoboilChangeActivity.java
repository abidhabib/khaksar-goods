package com.example.ishaqcargo;

import android.os.Bundle;
import android.text.Editable;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import com.example.ishaqcargo.databinding.ActivityMoboilChangeBinding;
import com.example.ishaqcargo.network.ApiClient;
import com.example.ishaqcargo.util.SessionManager;

import org.json.JSONObject;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;

public class MoboilChangeActivity extends AppCompatActivity {

    public static final String EXTRA_CAR_NUMBER = "extra_car_number";
    public static final String EXTRA_CURRENT_METER = "extra_current_meter";
    public static final String EXTRA_REFERENCE_METER = "extra_reference_meter";
    private static final double MOBOIL_CHANGE_INTERVAL = 5000d;

    private ActivityMoboilChangeBinding binding;
    private SessionManager sessionManager;
    private String baseUrl;
    private double currentMeterReading;
    private double baselineMeterReading;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        binding = ActivityMoboilChangeBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());

        sessionManager = new SessionManager(this);
        baseUrl = sessionManager.getBaseUrl();
        currentMeterReading = getIntent().getDoubleExtra(EXTRA_CURRENT_METER, 0);
        String carNumber = getIntent().getStringExtra(EXTRA_CAR_NUMBER);
        baselineMeterReading = getIntent().getDoubleExtra(EXTRA_REFERENCE_METER, 0);

        binding.carNumberValue.setText(getString(R.string.car_number_value, TextUtils.isEmpty(carNumber) ? "-" : carNumber));
        binding.currentMeterValue.setText(getString(R.string.moboil_current_meter_value, formatPlainNumber(currentMeterReading)));
        binding.remainingValue.setText(formatPlainNumber(calculateRemainingKm(currentMeterReading)) + " km");

        binding.backButton.setOnClickListener(v -> finish());
        binding.saveButton.setOnClickListener(v -> saveMoboilChange());
        binding.meterInput.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) { }

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {
                updateRemainingPreview();
            }

            @Override
            public void afterTextChanged(Editable s) { }
        });
    }

    private void updateRemainingPreview() {
        String raw = binding.meterInput.getText() != null ? binding.meterInput.getText().toString().trim() : "";
        if (TextUtils.isEmpty(raw)) {
            binding.remainingValue.setText(getString(R.string.moboil_alert_empty));
            return;
        }

        try {
            double enteredMeter = Double.parseDouble(raw);
            if (enteredMeter < currentMeterReading) {
                binding.remainingValue.setText(getString(R.string.moboil_invalid_meter));
                return;
            }

            binding.remainingValue.setText(formatPlainNumber(calculateRemainingKm(enteredMeter)) + " km");
        } catch (NumberFormatException ignored) {
            binding.remainingValue.setText(getString(R.string.moboil_alert_empty));
        }
    }

    private void saveMoboilChange() {
        String token = sessionManager.getToken();
        if (token == null) {
            finish();
            return;
        }

        String meterText = binding.meterInput.getText() != null ? binding.meterInput.getText().toString().trim() : "";
        if (TextUtils.isEmpty(meterText)) {
            binding.meterInput.setError(getString(R.string.moboil_meter_required));
            return;
        }

        double enteredMeter;
        try {
            enteredMeter = Double.parseDouble(meterText);
        } catch (NumberFormatException exception) {
            binding.meterInput.setError(getString(R.string.moboil_meter_required));
            return;
        }

        if (enteredMeter < currentMeterReading) {
            binding.meterInput.setError(getString(R.string.moboil_meter_too_low));
            return;
        }

        setSaving(true);

        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("meter_reading", meterText);

        ApiClient.saveMoboilChange(baseUrl, token, fields, new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                runOnUiThread(() -> {
                    setSaving(false);
                    Toast.makeText(MoboilChangeActivity.this, R.string.unable_to_save_daily_expense, Toast.LENGTH_LONG).show();
                });
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String body = response.body() != null ? response.body().string() : "";
                if (!response.isSuccessful()) {
                    String message = ApiClient.parseErrorMessage(body, getString(R.string.unable_to_save_daily_expense));
                    runOnUiThread(() -> {
                        setSaving(false);
                        Toast.makeText(MoboilChangeActivity.this, message, Toast.LENGTH_LONG).show();
                    });
                    return;
                }

                try {
                    JSONObject root = new JSONObject(body);
                    JSONObject moboilStatus = root.optJSONObject("moboil_status");
                    double remainingKm = moboilStatus != null ? moboilStatus.optDouble("remaining_km", MOBOIL_CHANGE_INTERVAL) : MOBOIL_CHANGE_INTERVAL;
                    runOnUiThread(() -> {
                        setSaving(false);
                        currentMeterReading = enteredMeter;
                        binding.currentMeterValue.setText(getString(R.string.moboil_current_meter_value, formatPlainNumber(currentMeterReading)));
                        binding.remainingValue.setText(formatPlainNumber(remainingKm) + " km");
                        setResult(RESULT_OK);
                        Toast.makeText(MoboilChangeActivity.this, R.string.daily_expense_saved, Toast.LENGTH_LONG).show();
                        finish();
                    });
                } catch (Exception exception) {
                    runOnUiThread(() -> {
                        setSaving(false);
                        Toast.makeText(MoboilChangeActivity.this, R.string.invalid_daily_expense_response, Toast.LENGTH_LONG).show();
                    });
                }
            }
        });
    }

    private void setSaving(boolean saving) {
        binding.saveButton.setEnabled(!saving);
        binding.meterInput.setEnabled(!saving);
    }

    private double calculateRemainingKm(double meterReading) {
        double kmSinceChange = Math.max(0, meterReading - baselineMeterReading);
        return Math.max(0, MOBOIL_CHANGE_INTERVAL - kmSinceChange);
    }

    private String formatPlainNumber(double value) {
        if (Math.abs(value - Math.rint(value)) < 0.0001d) {
            return String.format(Locale.US, "%.0f", value);
        }
        return String.format(Locale.US, "%.2f", value);
    }
}
