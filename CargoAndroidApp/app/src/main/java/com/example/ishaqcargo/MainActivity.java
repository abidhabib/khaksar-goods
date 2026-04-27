package com.example.ishaqcargo;

import android.content.Intent;
import android.os.Bundle;

import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.core.os.LocaleListCompat;

import com.example.ishaqcargo.databinding.ActivityMainBinding;
import com.example.ishaqcargo.util.SessionManager;

public class MainActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ensureDefaultUrduLocale();
        ActivityMainBinding binding = ActivityMainBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());

        SessionManager sessionManager = new SessionManager(this);

        Intent intent;
        if (sessionManager.isLoggedIn()) {
            intent = new Intent(this, DriverDashboardActivity.class);
        } else {
            intent = new Intent(this, LoginActivity.class);
        }

        startActivity(intent);
        finish();
    }

    private void ensureDefaultUrduLocale() {
        String currentLanguage = AppCompatDelegate.getApplicationLocales().toLanguageTags();
        if (currentLanguage == null || currentLanguage.trim().isEmpty()) {
            AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags("ur"));
        }
    }
}
