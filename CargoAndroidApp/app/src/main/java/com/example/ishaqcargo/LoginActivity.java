package com.example.ishaqcargo;

import android.content.Intent;
import android.os.Bundle;
import android.text.TextUtils;
import android.util.Log;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.core.os.LocaleListCompat;

import com.example.ishaqcargo.databinding.ActivityLoginBinding;
import com.example.ishaqcargo.network.ApiClient;
import com.example.ishaqcargo.util.SessionManager;

import org.json.JSONObject;

import java.io.IOException;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;

public class LoginActivity extends AppCompatActivity {

    private ActivityLoginBinding binding;
    private SessionManager sessionManager;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ensureDefaultUrduLocale();
        binding = ActivityLoginBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());

        sessionManager = new SessionManager(this);

        setupLanguageSwitcher();
        binding.loginButton.setOnClickListener(v -> attemptLogin());
    }

    private void ensureDefaultUrduLocale() {
        String currentLanguage = AppCompatDelegate.getApplicationLocales().toLanguageTags();
        if (currentLanguage == null || currentLanguage.trim().isEmpty()) {
            AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags("ur"));
        }
    }

    private void setupLanguageSwitcher() {
        String currentLanguage = AppCompatDelegate.getApplicationLocales().toLanguageTags();
        boolean isUrduSelected = currentLanguage != null && currentLanguage.startsWith("ur");
        binding.languageToggle.check(isUrduSelected ? R.id.buttonUrdu : R.id.buttonEnglish);

        binding.languageToggle.addOnButtonCheckedListener((group, checkedId, isChecked) -> {
            if (!isChecked) {
                return;
            }

            String selectedLanguage = checkedId == R.id.buttonUrdu ? "ur" : "en";
            String activeLanguage = AppCompatDelegate.getApplicationLocales().toLanguageTags();
            boolean isEnglishDefault = (activeLanguage == null || activeLanguage.isEmpty()) && "en".equals(selectedLanguage);
            boolean isSameLanguage = activeLanguage != null && activeLanguage.startsWith(selectedLanguage);
            if (isEnglishDefault || isSameLanguage) {
                return;
            }

            AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(selectedLanguage));
        });
    }

    private void attemptLogin() {
        String baseUrl = sessionManager.getBaseUrl();

        Log.d("API_DEBUG", "BASE URL: " + baseUrl);
        Log.d("API_DEBUG", "FINAL URL: " + baseUrl + "/auth/login");
        Toast.makeText(this, "BASE: " + baseUrl, Toast.LENGTH_LONG).show();
        String username = binding.usernameInput.getText() != null
                ? binding.usernameInput.getText().toString().trim()
                : "";
        String password = binding.passwordInput.getText() != null
                ? binding.passwordInput.getText().toString().trim()
                : "";
        baseUrl = sessionManager.getBaseUrl();

        if (TextUtils.isEmpty(username) || TextUtils.isEmpty(password)) {
            Toast.makeText(this, R.string.login_error_empty_credentials, Toast.LENGTH_SHORT).show();
            return;
        }

        setLoading(true);

        ApiClient.login(baseUrl, username, password, new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                runOnUiThread(() -> {
                    setLoading(false);
                    Toast.makeText(
                            LoginActivity.this,
                            R.string.login_error_network,
                            Toast.LENGTH_LONG
                    ).show();
                });
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String body = response.body() != null ? response.body().string() : "";

                if (!response.isSuccessful()) {
                    String error = getString(R.string.login_error_failed);
                    try {
                        JSONObject jsonObject = new JSONObject(body);
                        error = jsonObject.optString("message", error);
                    } catch (Exception ignored) {
                    }

                    String finalError = error;
                    runOnUiThread(() -> {
                        setLoading(false);
                        Toast.makeText(LoginActivity.this, finalError, Toast.LENGTH_LONG).show();
                    });
                    return;
                }

                try {
                    JSONObject jsonObject = new JSONObject(body);
                    String token = jsonObject.optString("token", null);
                    JSONObject user = jsonObject.optJSONObject("user");
                    String role = user != null ? user.optString("role", "") : "";
                    String driverUsername = user != null ? user.optString("username", username) : username;

                    if (token == null || token.trim().isEmpty()) {
                        runOnUiThread(() -> {
                            setLoading(false);
                            Toast.makeText(LoginActivity.this, R.string.login_error_missing_token, Toast.LENGTH_LONG).show();
                        });
                        return;
                    }

                    if (!"driver".equalsIgnoreCase(role)) {
                        runOnUiThread(() -> {
                            setLoading(false);
                            Toast.makeText(LoginActivity.this, R.string.login_error_driver_only, Toast.LENGTH_LONG).show();
                        });
                        return;
                    }

                    sessionManager.saveSession(token, driverUsername);

                    runOnUiThread(() -> {
                        setLoading(false);
                        startActivity(new Intent(LoginActivity.this, DriverDashboardActivity.class));
                        finish();
                    });
                } catch (Exception e) {
                    runOnUiThread(() -> {
                        setLoading(false);
                        Toast.makeText(LoginActivity.this, R.string.login_error_parsing, Toast.LENGTH_LONG).show();
                    });
                }
            }
        });
    }

    private void setLoading(boolean loading) {
        binding.loginButton.setEnabled(!loading);
        binding.loginButton.setText(R.string.login_button);
        binding.loadingOverlay.setVisibility(loading ? android.view.View.VISIBLE : android.view.View.GONE);
    }
}
