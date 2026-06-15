package com.example.ishaqcargo;

import android.Manifest;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.core.content.ContextCompat;
import androidx.core.os.LocaleListCompat;

import com.example.ishaqcargo.databinding.ActivityMainBinding;
import com.example.ishaqcargo.util.SessionManager;

public class MainActivity extends AppCompatActivity {
    private static final String PREF_APP_LAUNCH = "app_launch_prefs";
    private static final String KEY_STARTUP_PERMISSIONS_REQUESTED = "startup_permissions_requested";

    private final String[] requiredPermissions = new String[] {
        Manifest.permission.CAMERA,
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION
    };

    private final ActivityResultLauncher<String[]> startupPermissionLauncher = registerForActivityResult(
            new ActivityResultContracts.RequestMultiplePermissions(),
            result -> {
                handlePermissionResults(result);
            }
    );

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ensureDefaultUrduLocale();
        ActivityMainBinding binding = ActivityMainBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());

        if (hasAllPermissions()) {
            openNextScreen();
            return;
        }

        if (shouldShowRationale()) {
            showRationaleDialog();
        } else {
            requestPermissions();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Re-check when returning from Settings
        if (hasAllPermissions()) {
            openNextScreen();
        }
    }

    private boolean hasAllPermissions() {
        boolean cameraGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED;
        boolean locationGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
        return cameraGranted && locationGranted;
    }

    private boolean shouldShowRationale() {
        for (String permission : requiredPermissions) {
            if (shouldShowRequestPermissionRationale(permission)) {
                return true;
            }
        }
        return false;
    }

    private void requestPermissions() {
        startupPermissionLauncher.launch(requiredPermissions);
    }

    private void handlePermissionResults(java.util.Map<String, Boolean> result) {
        boolean cameraGranted = Boolean.TRUE.equals(result.get(Manifest.permission.CAMERA));
        boolean fineGranted = Boolean.TRUE.equals(result.get(Manifest.permission.ACCESS_FINE_LOCATION));
        boolean coarseGranted = Boolean.TRUE.equals(result.get(Manifest.permission.ACCESS_COARSE_LOCATION));
        boolean locationGranted = fineGranted || coarseGranted;

        if (cameraGranted && locationGranted) {
            markStartupPermissionsRequested();
            openNextScreen();
            return;
        }

        // Check which are permanently denied
        boolean cameraPermanentlyDenied = !cameraGranted && !shouldShowRequestPermissionRationale(Manifest.permission.CAMERA);
        boolean locationPermanentlyDenied = !locationGranted
                && !shouldShowRequestPermissionRationale(Manifest.permission.ACCESS_FINE_LOCATION)
                && !shouldShowRequestPermissionRationale(Manifest.permission.ACCESS_COARSE_LOCATION);

        if (cameraPermanentlyDenied || locationPermanentlyDenied) {
            showSettingsDialog();
        } else {
            showRetryDialog();
        }
    }

    private void showRationaleDialog() {
        new AlertDialog.Builder(this)
            .setTitle("Permissions Required")
            .setMessage("Camera is needed to capture meter readings and receipts.\n\nLocation is needed to track trip routes and distances.")
            .setPositiveButton("Grant", (dialog, which) -> {
                dialog.dismiss();
                requestPermissions();
            })
            .setNegativeButton("Exit", (dialog, which) -> {
                dialog.dismiss();
                finish();
            })
            .setCancelable(false)
            .show();
    }

    private void showRetryDialog() {
        new AlertDialog.Builder(this)
            .setTitle("Permissions Denied")
            .setMessage("Some permissions were denied. The app needs Camera and Location to function properly.")
            .setPositiveButton("Retry", (dialog, which) -> {
                dialog.dismiss();
                requestPermissions();
            })
            .setNegativeButton("Exit", (dialog, which) -> {
                dialog.dismiss();
                finish();
            })
            .setCancelable(false)
            .show();
    }

    private void showSettingsDialog() {
        new AlertDialog.Builder(this)
            .setTitle("Permissions Required")
            .setMessage("Camera and Location permissions are required. Please enable them in App Settings.")
            .setPositiveButton("Open Settings", (dialog, which) -> {
                dialog.dismiss();
                Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.parse("package:" + getPackageName()));
                startActivity(intent);
            })
            .setNegativeButton("Exit", (dialog, which) -> {
                dialog.dismiss();
                finish();
            })
            .setCancelable(false)
            .show();
    }

    private void markStartupPermissionsRequested() {
        getSharedPreferences(PREF_APP_LAUNCH, MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_STARTUP_PERMISSIONS_REQUESTED, true)
                .apply();
    }

    private void openNextScreen() {
        SessionManager sessionManager = new SessionManager(this);
        Intent intent = sessionManager.isLoggedIn()
                ? new Intent(this, DriverDashboardActivity.class)
                : new Intent(this, LoginActivity.class);
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