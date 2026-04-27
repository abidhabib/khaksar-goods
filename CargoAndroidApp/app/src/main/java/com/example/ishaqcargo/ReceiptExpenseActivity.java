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

import com.example.ishaqcargo.databinding.ActivityReceiptExpenseBinding;
import com.example.ishaqcargo.network.ApiClient;
import com.example.ishaqcargo.util.SessionManager;

import java.io.File;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;

public class ReceiptExpenseActivity extends AppCompatActivity {

    public static final String EXTRA_TRIP_ID = "trip_id";
    public static final String EXTRA_CATEGORY = "category";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_SAVE_LABEL = "save_label";
    public static final String EXTRA_UPLOAD_LABEL = "upload_label";
    public static final String EXTRA_CHANGE_LABEL = "change_label";
    public static final String EXTRA_PHOTO_REQUIRED_MESSAGE = "photo_required_message";
    private static final String STATE_PENDING_URI = "state_pending_uri";
    private static final String STATE_IMAGE_URI = "state_image_uri";

    private ActivityReceiptExpenseBinding binding;
    private SessionManager sessionManager;
    private String baseUrl;
    private String tripId;
    private String category;
    private Uri pendingCameraUri;
    private Uri receiptPhotoUri;

    private final ActivityResultLauncher<Uri> takePhotoLauncher = registerForActivityResult(
            new ActivityResultContracts.TakePicture(),
            success -> {
                if (success && pendingCameraUri != null) {
                    receiptPhotoUri = pendingCameraUri;
                    binding.photoPreview.setImageURI(receiptPhotoUri);
                    binding.photoPreview.setVisibility(View.VISIBLE);
                    binding.uploadHint.setText(getIntent().getStringExtra(EXTRA_CHANGE_LABEL));
                } else {
                    pendingCameraUri = null;
                }
            }
    );

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        binding = ActivityReceiptExpenseBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());
        WindowCompat.getInsetsController(getWindow(), binding.getRoot()).setAppearanceLightStatusBars(true);

        sessionManager = new SessionManager(this);
        baseUrl = sessionManager.getBaseUrl();
        tripId = getIntent().getStringExtra(EXTRA_TRIP_ID);
        category = getIntent().getStringExtra(EXTRA_CATEGORY);

        applyWindowInsets();
        restoreTransientState(savedInstanceState);

        binding.titleText.setText(getIntent().getStringExtra(EXTRA_TITLE));
        binding.uploadLabel.setText(R.string.chalaan_photo);
        binding.uploadHint.setText(getIntent().getStringExtra(EXTRA_UPLOAD_LABEL));
        binding.saveButton.setText(getIntent().getStringExtra(EXTRA_SAVE_LABEL));

        binding.backButton.setOnClickListener(v -> finish());
        binding.uploadHint.setOnClickListener(v -> openCamera());
        binding.photoPreview.setOnClickListener(v -> openCamera());
        binding.saveButton.setOnClickListener(v -> saveExpense());
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        outState.putString(STATE_PENDING_URI, pendingCameraUri != null ? pendingCameraUri.toString() : null);
        outState.putString(STATE_IMAGE_URI, receiptPhotoUri != null ? receiptPhotoUri.toString() : null);
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

    private void openCamera() {
        try {
            pendingCameraUri = createTempImageUri("receipt_");
            takePhotoLauncher.launch(pendingCameraUri);
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

    private void saveExpense() {
        String amount = getInput(binding.amountInput);
        if (TextUtils.isEmpty(amount)) {
            binding.amountInput.setError(getString(R.string.enter_expense_amount));
            return;
        }

        if (receiptPhotoUri == null) {
            Toast.makeText(this, getIntent().getStringExtra(EXTRA_PHOTO_REQUIRED_MESSAGE), Toast.LENGTH_SHORT).show();
            return;
        }

        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("category", TextUtils.isEmpty(category) ? "chalaan" : category);
        fields.put("amount", amount);

        setSubmitting(true);
        ContentResolver contentResolver = getContentResolver();
        ApiClient.addTripExpense(baseUrl, sessionManager.getToken(), tripId, fields, receiptPhotoUri, contentResolver, new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                runOnUiThread(() -> {
                    setSubmitting(false);
                    Toast.makeText(ReceiptExpenseActivity.this, R.string.unable_to_save_expense, Toast.LENGTH_LONG).show();
                });
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String body = response.body() != null ? response.body().string() : "";
                if (!response.isSuccessful()) {
                    String message = ApiClient.parseErrorMessage(body, getString(R.string.unable_to_save_expense));
                    runOnUiThread(() -> {
                        setSubmitting(false);
                        Toast.makeText(ReceiptExpenseActivity.this, message, Toast.LENGTH_LONG).show();
                    });
                    return;
                }

                runOnUiThread(() -> {
                    setSubmitting(false);
                    setResult(RESULT_OK);
                    Toast.makeText(ReceiptExpenseActivity.this, R.string.expense_saved_successfully, Toast.LENGTH_SHORT).show();
                    finish();
                });
            }
        });
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
            receiptPhotoUri = Uri.parse(imageUri);
            binding.photoPreview.setImageURI(receiptPhotoUri);
            binding.photoPreview.setVisibility(View.VISIBLE);
            binding.uploadHint.setText(getIntent().getStringExtra(EXTRA_CHANGE_LABEL));
        }
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
