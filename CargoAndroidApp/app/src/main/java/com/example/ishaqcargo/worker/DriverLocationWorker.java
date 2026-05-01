package com.example.ishaqcargo.worker;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Address;
import android.location.Geocoder;
import android.location.Location;
import android.location.LocationManager;
import android.os.Build;
import android.text.TextUtils;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import com.example.ishaqcargo.network.ApiClient;
import com.example.ishaqcargo.util.SessionManager;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;

public class DriverLocationWorker extends Worker {
    public DriverLocationWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        SessionManager sessionManager = new SessionManager(context);
        String token = sessionManager.getToken();

        if (TextUtils.isEmpty(token)) {
            return Result.success();
        }

        if (!hasLocationPermission(context)) {
            return Result.success();
        }

        Location location = getBestLastKnownLocation(context);
        if (location == null) {
            return Result.retry();
        }

        Map<String, String> fields = buildLocationPayload(location);
        CountDownLatch latch = new CountDownLatch(1);
        boolean[] successful = new boolean[] { false };

        ApiClient.saveCurrentLocation(sessionManager.getBaseUrl(), token, fields, new Callback() {
            @Override
            public void onFailure(@NonNull Call call, @NonNull IOException e) {
                latch.countDown();
            }

            @Override
            public void onResponse(@NonNull Call call, @NonNull Response response) {
                successful[0] = response.isSuccessful();
                response.close();
                latch.countDown();
            }
        });

        try {
            boolean completed = latch.await(40, TimeUnit.SECONDS);
            if (!completed) {
                return Result.retry();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Result.retry();
        }

        return successful[0] ? Result.success() : Result.retry();
    }

    private boolean hasLocationPermission(Context context) {
        boolean hasForegroundPermission =
                ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                        || ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;

        if (!hasForegroundPermission) {
            return false;
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            return true;
        }

        return ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private Location getBestLastKnownLocation(Context context) {
        LocationManager locationManager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        if (locationManager == null) {
            return null;
        }

        List<String> providers = locationManager.getProviders(true);
        if (providers == null) {
            return null;
        }

        Location bestLocation = null;
        for (String provider : providers) {
            try {
                Location candidate = locationManager.getLastKnownLocation(provider);
                if (candidate == null) {
                    continue;
                }

                if (bestLocation == null || candidate.getTime() > bestLocation.getTime()) {
                    bestLocation = candidate;
                }
            } catch (SecurityException ignored) {
                return null;
            }
        }

        return bestLocation;
    }

    private Map<String, String> buildLocationPayload(Location location) {
        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("latitude", String.format(Locale.US, "%.7f", location.getLatitude()));
        fields.put("longitude", String.format(Locale.US, "%.7f", location.getLongitude()));
        fields.put("source", "driver_app_worker");

        Address address = reverseGeocode(location);
        if (address != null) {
            String area = firstNonEmpty(address.getSubLocality(), address.getLocality(), address.getFeatureName());
            String city = firstNonEmpty(address.getLocality(), address.getSubAdminArea(), address.getAdminArea());
            String province = firstNonEmpty(address.getAdminArea(), address.getSubAdminArea());
            String label = buildAddressLabel(area, city, province);

            if (!TextUtils.isEmpty(area)) {
                fields.put("area", area);
            }
            if (!TextUtils.isEmpty(city)) {
                fields.put("city", city);
            }
            if (!TextUtils.isEmpty(province)) {
                fields.put("province", province);
            }
            if (!TextUtils.isEmpty(label)) {
                fields.put("address_label", label);
            }
        }

        return fields;
    }

    private Address reverseGeocode(Location location) {
        if (!Geocoder.isPresent()) {
            return null;
        }

        try {
            Geocoder geocoder = new Geocoder(getApplicationContext(), Locale.getDefault());
            List<Address> addresses = geocoder.getFromLocation(location.getLatitude(), location.getLongitude(), 1);
            if (addresses == null || addresses.isEmpty()) {
                return null;
            }

            return addresses.get(0);
        } catch (IOException | IllegalArgumentException ignored) {
            return null;
        }
    }

    private String buildAddressLabel(String area, String city, String province) {
        StringBuilder builder = new StringBuilder();
        appendPart(builder, area);
        appendPart(builder, city);
        appendPart(builder, province);
        return builder.toString();
    }

    private void appendPart(StringBuilder builder, String value) {
        if (TextUtils.isEmpty(value)) {
            return;
        }

        if (builder.length() > 0) {
            builder.append(", ");
        }
        builder.append(value.trim());
    }

    private String firstNonEmpty(String... values) {
        if (values == null) {
            return null;
        }

        for (String value : values) {
            if (!TextUtils.isEmpty(value)) {
                return value.trim();
            }
        }

        return null;
    }
}
