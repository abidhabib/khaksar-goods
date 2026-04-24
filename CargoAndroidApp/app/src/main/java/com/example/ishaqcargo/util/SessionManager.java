package com.example.ishaqcargo.util;

import android.content.Context;
import android.content.SharedPreferences;

public class SessionManager {
    private static final String PREF_NAME = "cargo_driver_session";
    private static final String KEY_TOKEN = "token";
    private static final String KEY_USERNAME = "username";
    private static final String KEY_BASE_URL = "base_url";
//    private static final String DEFAULT_BASE_URL = "https://api.khaksargoods.com/api";
      private static final String DEFAULT_BASE_URL = "http://192.168.0.109:5000/api";



    private final SharedPreferences preferences;

    public SessionManager(Context context) {
        preferences = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
    }

    public void saveSession(String token, String username) {
        preferences.edit()
                .putString(KEY_TOKEN, token)
                .putString(KEY_USERNAME, username)
                .apply();
    }

    public String getToken() {
        return preferences.getString(KEY_TOKEN, null);
    }

    public String getUsername() {
        return preferences.getString(KEY_USERNAME, "Driver");
    }

    public void saveBaseUrl(String baseUrl) {
        preferences.edit().putString(KEY_BASE_URL, normalizeBaseUrl(baseUrl)).apply();
    }

    public String getBaseUrl() {
        String raw = preferences.getString(KEY_BASE_URL, DEFAULT_BASE_URL);
        return normalizeBaseUrl(raw);
    }

    public boolean isLoggedIn() {
        String token = getToken();
        return token != null && !token.trim().isEmpty();
    }

    public void clearSession() {
        String baseUrl = getBaseUrl();
        preferences.edit().clear().apply();
        saveBaseUrl(baseUrl);
    }

    private String normalizeBaseUrl(String value) {
        if (value == null || value.trim().isEmpty()) {
            return DEFAULT_BASE_URL;
        }

        String trimmed = value.trim();
        while (trimmed.endsWith("/")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }

        if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
            trimmed = "http://" + trimmed;
        }

        return trimmed;
    }
}
