package com.example.ishaqcargo;

import android.content.ContentResolver;
import android.net.Uri;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.View;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.example.ishaqcargo.databinding.ActivityDieselExpenseBinding;
import com.example.ishaqcargo.network.ApiClient;
import com.example.ishaqcargo.util.SessionManager;

import java.io.File;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;

public class DieselExpenseActivity extends AppCompatActivity {

    private ActivityDieselExpenseBinding binding;
    private SessionManager sessionManager;
    private String baseUrl;
    private String tripId;
    private Uri meterPhotoUri;
    private Uri pendingCameraUri;

    private final ActivityResultLauncher<Uri> takeMeterPhotoLauncher = registerForActivityResult(
            new ActivityResultContracts.TakePicture(),
            success -> {
                if (success && pendingCameraUri != null) {
                    meterPhotoUri = pendingCameraUri;
                    binding.meterPhotoPreview.setImageURI(meterPhotoUri);
                    binding.meterPhotoPreview.setVisibility(View.VISIBLE);
                    binding.uploadHint.setText(R.string.change_diesel_meter_photo);
                } else {
                    pendingCameraUri = null;
                }
            }
    );

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        binding = ActivityDieselExpenseBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());
        WindowCompat.getInsetsController(getWindow(), binding.getRoot()).setAppearanceLightStatusBars(true);

        sessionManager = new SessionManager(this);
        baseUrl = sessionManager.getBaseUrl();
        tripId = getIntent().getStringExtra(EndTripActivity.EXTRA_TRIP_ID);

        applyWindowInsets();

        binding.backButton.setOnClickListener(v -> finish());
        binding.uploadHint.setOnClickListener(v -> openCameraForMeterPhoto());
        binding.meterPhotoPreview.setOnClickListener(v -> openCameraForMeterPhoto());
        binding.saveButton.setOnClickListener(v -> saveExpense());
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

    private void openCameraForMeterPhoto() {
        try {
            File imageFile = File.createTempFile(
                    "diesel_meter_" + System.currentTimeMillis(),
                    ".jpg",
                    getCacheDir()
            );
            pendingCameraUri = FileProvider.getUriForFile(
                    this,
                    getPackageName() + ".fileprovider",
                    imageFile
            );
            takeMeterPhotoLauncher.launch(pendingCameraUri);
        } catch (Exception exception) {
            Toast.makeText(this, R.string.unable_to_open_camera, Toast.LENGTH_SHORT).show();
        }
    }

    private void saveExpense() {
        String amount = getInput(binding.amountInput);
        if (TextUtils.isEmpty(amount)) {
            binding.amountInput.setError(getString(R.string.enter_expense_amount));
            return;
        }

        String liters = getInput(binding.litersInput);
        if (TextUtils.isEmpty(liters)) {
            binding.litersInput.setError(getString(R.string.diesel_liters_required));
            return;
        }

        if (meterPhotoUri == null) {
            Toast.makeText(this, R.string.diesel_meter_photo_required, Toast.LENGTH_SHORT).show();
            return;
        }

        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("category", "diesel");
        fields.put("amount", amount);

        String location = getInput(binding.locationInput);
        fields.put("liters", liters);
        if (!TextUtils.isEmpty(location)) {
            fields.put("location", location);
        }

        setSubmitting(true);
        ContentResolver contentResolver = meterPhotoUri != null ? getContentResolver() : null;
        ApiClient.addTripExpense(baseUrl, sessionManager.getToken(), tripId, fields, meterPhotoUri, contentResolver, new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                runOnUiThread(() -> {
                    setSubmitting(false);
                    Toast.makeText(DieselExpenseActivity.this, R.string.unable_to_save_expense, Toast.LENGTH_LONG).show();
                });
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String body = response.body() != null ? response.body().string() : "";
                if (!response.isSuccessful()) {
                    String message = ApiClient.parseErrorMessage(body, getString(R.string.unable_to_save_expense));
                    runOnUiThread(() -> {
                        setSubmitting(false);
                        Toast.makeText(DieselExpenseActivity.this, message, Toast.LENGTH_LONG).show();
                    });
                    return;
                }

                runOnUiThread(() -> {
                    setSubmitting(false);
                    setResult(RESULT_OK);
                    Toast.makeText(DieselExpenseActivity.this, R.string.expense_saved_successfully, Toast.LENGTH_SHORT).show();
                    finish();
                });
            }
        });
    }

    private void setSubmitting(boolean submitting) {
        binding.loadingOverlay.setVisibility(submitting ? View.VISIBLE : View.GONE);
        binding.saveButton.setEnabled(!submitting);
        binding.uploadHint.setEnabled(!submitting);
    }

    private String getInput(com.google.android.material.textfield.TextInputEditText input) {
        return input.getText() != null ? input.getText().toString().trim() : "";
    }
}
