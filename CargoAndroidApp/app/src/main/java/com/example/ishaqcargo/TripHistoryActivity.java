package com.example.ishaqcargo;

import android.content.Intent;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.ImageView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.bumptech.glide.Glide;
import com.example.ishaqcargo.databinding.ActivityTripHistoryBinding;
import com.example.ishaqcargo.network.ApiClient;
import com.example.ishaqcargo.util.SessionManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Locale;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;

public class TripHistoryActivity extends AppCompatActivity {

    private static final DateTimeFormatter SERVER_DATE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final DateTimeFormatter DISPLAY_DATE_TIME = DateTimeFormatter.ofPattern("dd MMM yyyy, hh:mm a", Locale.US);

    private ActivityTripHistoryBinding binding;
    private SessionManager sessionManager;
    private String baseUrl;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        binding = ActivityTripHistoryBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());
        WindowCompat.getInsetsController(getWindow(), binding.getRoot()).setAppearanceLightStatusBars(true);

        sessionManager = new SessionManager(this);
        baseUrl = sessionManager.getBaseUrl();

        applyWindowInsets();
        binding.historyBackButton.setOnClickListener(v -> finish());
        binding.historyRefreshButton.setOnClickListener(v -> loadTripHistory());

        loadTripHistory();
    }

    private void applyWindowInsets() {
        final int topBarTopPadding = binding.historyTopBar.getPaddingTop();
        final int historyBottomPadding = binding.historyScroll.getPaddingBottom();
        ViewCompat.setOnApplyWindowInsetsListener(binding.getRoot(), (view, windowInsets) -> {
            Insets insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            binding.historyTopBar.setPadding(
                    binding.historyTopBar.getPaddingLeft(),
                    topBarTopPadding + insets.top,
                    binding.historyTopBar.getPaddingRight(),
                    binding.historyTopBar.getPaddingBottom()
            );
            binding.historyScroll.setPadding(
                    binding.historyScroll.getPaddingLeft(),
                    binding.historyScroll.getPaddingTop(),
                    binding.historyScroll.getPaddingRight(),
                    historyBottomPadding + insets.bottom + getResources().getDimensionPixelSize(R.dimen.dashboard_bottom_padding)
            );
            return windowInsets;
        });
    }

    private void loadTripHistory() {
        String token = sessionManager.getToken();
        if (token == null) {
            return;
        }

        setLoading(true);

        ApiClient.getTripHistory(baseUrl, token, 100, new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                runOnUiThread(() -> {
                    setLoading(false);
                    Toast.makeText(TripHistoryActivity.this, "Unable to load trip history", Toast.LENGTH_LONG).show();
                });
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String body = response.body() != null ? response.body().string() : "";

                if (!response.isSuccessful()) {
                    String message = ApiClient.parseErrorMessage(body, "Unable to load trip history");
                    runOnUiThread(() -> {
                        setLoading(false);
                        Toast.makeText(TripHistoryActivity.this, message, Toast.LENGTH_LONG).show();
                    });
                    return;
                }

                try {
                    JSONObject root = new JSONObject(body);
                    JSONArray trips = root.optJSONArray("trips");
                    runOnUiThread(() -> {
                        renderTrips(trips);
                        setLoading(false);
                    });
                } catch (Exception e) {
                    runOnUiThread(() -> {
                        setLoading(false);
                        Toast.makeText(TripHistoryActivity.this, "Invalid trip history response", Toast.LENGTH_LONG).show();
                    });
                }
            }
        });
    }

    private void renderTrips(JSONArray trips) {
        binding.tripListContainer.removeAllViews();
        LayoutInflater inflater = LayoutInflater.from(this);

        if (trips == null || trips.length() == 0) {
            binding.emptyHistoryState.setVisibility(View.VISIBLE);
            binding.tripListContainer.setVisibility(View.GONE);
            return;
        }

        binding.emptyHistoryState.setVisibility(View.GONE);
        binding.tripListContainer.setVisibility(View.VISIBLE);

        for (int i = 0; i < trips.length(); i++) {
            JSONObject trip = trips.optJSONObject(i);
            if (trip == null) {
                continue;
            }

            View tripCard = inflater.inflate(R.layout.item_trip_history, binding.tripListContainer, false);
            bindTripCard(tripCard, trip);
            binding.tripListContainer.addView(tripCard);
        }
    }

    private void bindTripCard(View tripCard, JSONObject trip) {
        TextView routeText = tripCard.findViewById(R.id.tripRouteText);
        TextView statusText = tripCard.findViewById(R.id.tripStatusText);
        TextView tripMetaText = tripCard.findViewById(R.id.tripMetaText);
        TextView tripMeterText = tripCard.findViewById(R.id.tripMeterText);
        TextView tripFinanceText = tripCard.findViewById(R.id.tripFinanceText);
        TextView tripExpenseBreakdownText = tripCard.findViewById(R.id.tripExpenseBreakdownText);
        TextView tripNotesText = tripCard.findViewById(R.id.tripNotesText);
        ImageView startMeterImage = tripCard.findViewById(R.id.startMeterImage);
        ImageView endMeterImage = tripCard.findViewById(R.id.endMeterImage);
        TextView startImageHint = tripCard.findViewById(R.id.startImageHint);
        TextView endImageHint = tripCard.findViewById(R.id.endImageHint);

        String from = trip.optString("from_location", "-");
        String to = trip.optString("to_location", "-");
        String status = trip.optString("status", "unknown");
        double startMeter = trip.optDouble("start_meter_reading", 0);
        double endMeter = trip.isNull("end_meter_reading")
                ? startMeter
                : trip.optDouble("end_meter_reading", startMeter);
        double distance = trip.optDouble("distance_km", endMeter - startMeter);
        double freight = trip.optDouble("freight_charge", 0);
        double totalExpense = trip.optDouble("total_expenses", 0);
        double dieselExpense = trip.optDouble("diesel_expense", 0);
        double tollExpense = trip.optDouble("toll_expense", 0);
        double foodExpense = trip.optDouble("food_expense", 0);
        double otherExpense = trip.optDouble("other_expense", 0);
        String startedAt = formatTimestamp(trip.optString("started_at", ""));
        String endedAt = formatTimestamp(trip.optString("ended_at", ""));
        String notes = trip.optString("notes", "");
        String startImageUrl = trip.optString("start_meter_image", "");
        String endImageUrl = trip.optString("end_meter_image", "");

        routeText.setText(getString(R.string.trip_route_format, from, to));
        statusText.setText(capitalize(status));
        tripMetaText.setText(getString(R.string.trip_history_meta, startedAt, endedAt));
        tripMeterText.setText(getString(R.string.trip_history_meter, startMeter, endMeter, distance));
        tripFinanceText.setText(getString(
                R.string.trip_history_finance,
                formatCurrency(freight),
                formatCurrency(totalExpense),
                formatCurrency(freight - totalExpense)
        ));
        tripExpenseBreakdownText.setText(getString(
                R.string.trip_expense_breakdown,
                formatCurrency(dieselExpense),
                formatCurrency(tollExpense),
                formatCurrency(foodExpense),
                formatCurrency(otherExpense)
        ));

        if (notes == null || notes.trim().isEmpty()) {
            tripNotesText.setText(R.string.trip_notes_empty);
        } else {
            tripNotesText.setText(getString(R.string.trip_notes_value, notes));
        }

        bindImage(startMeterImage, startImageHint, startImageUrl, getString(R.string.trip_start_image));
        bindImage(endMeterImage, endImageHint, endImageUrl, getString(R.string.trip_end_image));
    }

    private void bindImage(ImageView imageView, TextView hintView, String imageUrl, String title) {
        boolean hasImage = imageUrl != null && !imageUrl.trim().isEmpty() && !"null".equalsIgnoreCase(imageUrl);

        if (!hasImage) {
            imageView.setImageResource(R.drawable.bg_image_placeholder);
            imageView.setAlpha(0.45f);
            imageView.setOnClickListener(null);
            hintView.setText(R.string.no_trip_image);
            return;
        }

        imageView.setAlpha(1f);
        hintView.setText(R.string.tap_to_view);

        Glide.with(this)
                .load(imageUrl)
                .placeholder(R.drawable.bg_image_placeholder)
                .error(R.drawable.bg_image_placeholder)
                .into(imageView);

        imageView.setOnClickListener(v -> openImagePreview(imageUrl, title));
        hintView.setOnClickListener(v -> openImagePreview(imageUrl, title));
    }

    private void openImagePreview(String imageUrl, String title) {
        Intent intent = new Intent(this, ImagePreviewActivity.class);
        intent.putExtra(ImagePreviewActivity.EXTRA_IMAGE_URL, imageUrl);
        intent.putExtra(ImagePreviewActivity.EXTRA_TITLE, title);
        startActivity(intent);
    }

    private void setLoading(boolean loading) {
        binding.historyLoadingOverlay.setVisibility(loading ? View.VISIBLE : View.GONE);
        binding.historyRefreshButton.setEnabled(!loading);
    }

    private String formatCurrency(double amount) {
        return String.format(Locale.US, "Rs %.0f", amount);
    }

    private String formatTimestamp(String rawValue) {
        if (rawValue == null || rawValue.trim().isEmpty() || "null".equalsIgnoreCase(rawValue)) {
            return "-";
        }

        try {
            LocalDateTime dateTime = LocalDateTime.parse(rawValue, SERVER_DATE_TIME);
            return dateTime.atZone(ZoneId.systemDefault()).format(DISPLAY_DATE_TIME);
        } catch (DateTimeParseException ignored) {
            return rawValue;
        }
    }

    private String capitalize(String value) {
        if (value == null || value.isEmpty()) {
            return "";
        }
        return Character.toUpperCase(value.charAt(0)) + value.substring(1);
    }
}
