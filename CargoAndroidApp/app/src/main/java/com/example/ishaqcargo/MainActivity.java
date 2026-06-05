package com.example.ishaqcargo;

import android.Manifest;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Bundle;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.core.content.ContextCompat;
import androidx.core.os.LocaleListCompat;

import com.example.ishaqcargo.databinding.ActivityMainBinding;
import com.example.ishaqcargo.util.SessionManager;

public class MainActivity extends AppCompatActivity {
    private static final String PREF_APP_LAUNCH = "app_launch_prefs";
    private static final String KEY_STARTUP_PERMISSIONS_REQUESTED = "startup_permissions_requested";

    private final ActivityResultLauncher<String[]> startupPermissionLauncher = registerForActivityResult(
            new ActivityResultContracts.RequestMultiplePermissions(),
            result -> {
                markStartupPermissionsRequested();
                openNextScreen();
            }
    );

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ensureDefaultUrduLocale();
        ActivityMainBinding binding = ActivityMainBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());

        if (shouldRequestStartupPermissions()) {
            startupPermissionLauncher.launch(new String[] {
                    Manifest.permission.CAMERA,
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
            });
            return;
        }

        openNextScreen();
    }

    private boolean shouldRequestStartupPermissions() {
        SharedPreferences preferences = getSharedPreferences(PREF_APP_LAUNCH, MODE_PRIVATE);
        boolean alreadyRequested = preferences.getBoolean(KEY_STARTUP_PERMISSIONS_REQUESTED, false);
        if (alreadyRequested) {
            return false;
        }

        boolean cameraGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED;
        boolean fineGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
        boolean coarseGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;

        if (cameraGranted && (fineGranted || coarseGranted)) {
            markStartupPermissionsRequested();
            return false;
        }

        return true;
    }

    private void markStartupPermissionsRequested() {
        getSharedPreferences(PREF_APP_LAUNCH, MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_STARTUP_PERMISSIONS_REQUESTED, true)
                .apply();
    }

    private void openNextScreen() {
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
