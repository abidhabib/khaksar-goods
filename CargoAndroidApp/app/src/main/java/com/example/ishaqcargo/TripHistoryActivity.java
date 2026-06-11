package com.example.ishaqcargo;

import android.content.Intent;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.ImageView;
import android.widget.LinearLayout;
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
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;

public class TripHistoryActivity extends AppCompatActivity {

    private static final DateTimeFormatter DISPLAY_DATE_TIME =
            DateTimeFormatter.ofPattern("EEE, dd MMM yyyy • hh:mm a", Locale.US);

    private ActivityTripHistoryBinding binding;
    private SessionManager sessionManager;
    private String baseUrl;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        binding = ActivityTripHistoryBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());
        WindowCompat.getInsetsController(getWindow(), binding.getRoot())
                .setAppearanceLightStatusBars(true);

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
                    historyBottomPadding + insets.bottom +
                            getResources().getDimensionPixelSize(R.dimen.dashboard_bottom_padding)
            );
            return windowInsets;
        });
    }

    private void loadTripHistory() {
        String token = sessionManager.getToken();
        if (token == null) return;

        setLoading(true);

        ApiClient.getTripHistory(baseUrl, token, 100, new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                runOnUiThread(() -> {
                    setLoading(false);
                    Toast.makeText(TripHistoryActivity.this,
                            "Unable to load trip history", Toast.LENGTH_LONG).show();
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
                        Toast.makeText(TripHistoryActivity.this,
                                "Invalid trip history response", Toast.LENGTH_LONG).show();
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
            if (trip == null) continue;

            View tripCard = inflater.inflate(R.layout.item_trip_history,
                    binding.tripListContainer, false);
            // Pass (i + 1) as the count badge number
            bindTripCard(tripCard, trip, i + 1);
            binding.tripListContainer.addView(tripCard);
        }
    }

    private void bindTripCard(View tripCard, JSONObject trip, int countNumber) {
        // Count Badge
        TextView countBadge = tripCard.findViewById(R.id.tripCountBadge);
        countBadge.setText(String.valueOf(countNumber));

        // Route & Status
        TextView routeText = tripCard.findViewById(R.id.tripRouteText);
        TextView statusText = tripCard.findViewById(R.id.tripStatusText);
        TextView tripMetaText = tripCard.findViewById(R.id.tripMetaText);
        TextView tripMeterText = tripCard.findViewById(R.id.tripMeterText);
        TextView tripFinanceText = tripCard.findViewById(R.id.tripFinanceText);
        TextView tripExpenseBreakdownText = tripCard.findViewById(R.id.tripExpenseBreakdownText);
        TextView tripNotesText = tripCard.findViewById(R.id.tripNotesText);
        LinearLayout lookingExpenseSection = tripCard.findViewById(R.id.lookingExpenseSection);
        LinearLayout lookingExpenseList = tripCard.findViewById(R.id.lookingExpenseList);
        TextView lookingExpenseTotalText = tripCard.findViewById(R.id.lookingExpenseTotalText);
        TextView lookingExpenseCountText = tripCard.findViewById(R.id.lookingExpenseCountText);


        // Data extraction
        String from = trip.optString("from_location", "-");
        String to = trip.optString("to_location", "-");
        String status = trip.optString("status", "unknown");
        double startMeter = trip.optDouble("start_meter_reading", 0);
        double endMeter = trip.isNull("end_meter_reading")
                ? startMeter : trip.optDouble("end_meter_reading", startMeter);
        double distance = trip.optDouble("distance_km", endMeter - startMeter);
        double freight = trip.optDouble("freight_charge", 0);
        double totalExpense = trip.optDouble("total_expenses", 0);
        double lookingExpenseTotal = trip.optDouble("between_trip_expenses_total", 0);
        double dieselExpense = trip.optDouble("diesel_expense", 0);
        double totalDieselLiters = trip.optDouble("total_diesel_liters", 0);
        double tripAverage = trip.isNull("trip_average_km_per_liter")
                ? 0 : trip.optDouble("trip_average_km_per_liter", 0);
        double tollExpense = trip.optDouble("toll_expense", 0);
        double foodExpense = trip.optDouble("food_expense", 0);
        double policeExpense = trip.optDouble("police_expense", 0);
        double chalaanExpense = trip.optDouble("chalaan_expense", 0);
        double mandiKaatExpense = trip.optDouble("mandi_kaat_expense", 0);
        double rewardExpense = trip.optDouble("reward_expense", 0);
        double biltyCommissionExpense = trip.optDouble("bilty_commission_expense", 0);
        double tyrePunctureExpense = trip.optDouble("tyre_puncture_expense", 0);
        String startedAt = formatTimestamp(trip.optString("started_at", ""));
        String endedAt = formatTimestamp(trip.optString("ended_at", ""));
        String notes = trip.optString("notes", "");
        String startImageUrl = trip.optString("start_meter_image", "");
        String endImageUrl = trip.optString("end_meter_image", "");
        String biltyImageUrl = trip.optString("bilty_slip_image", "");
        String loadPhotoUrl = trip.optString("load_photo", "");
        String liveStartLocation = trip.optString("start_live_location", "");
        String endLocation = trip.optString("end_location", "");
        String liveEndLocation = trip.optString("end_live_location", "");

        // Bind text
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
                formatCurrency(policeExpense),
                formatCurrency(chalaanExpense),
                formatCurrency(mandiKaatExpense),
                formatCurrency(rewardExpense),
                formatCurrency(biltyCommissionExpense),
                formatCurrency(tyrePunctureExpense)
        ));
        bindLookingExpenses(
                lookingExpenseSection,
                lookingExpenseList,
                lookingExpenseTotalText,
                lookingExpenseCountText,
                trip.optJSONArray("daily_expenses"),
                lookingExpenseTotal
        );

        // Notes builder
        StringBuilder notesBuilder = new StringBuilder();
        if (!TextUtils.isEmpty(liveStartLocation)) {
            notesBuilder.append("Live start: ").append(liveStartLocation);
        }
        String finalEndLocation = !TextUtils.isEmpty(endLocation) ? endLocation : liveEndLocation;
        if (!TextUtils.isEmpty(finalEndLocation)) {
            if (notesBuilder.length() > 0) notesBuilder.append('\n');
            notesBuilder.append("Actual end: ").append(finalEndLocation);
        }
        if (totalDieselLiters > 0) {
            if (notesBuilder.length() > 0) notesBuilder.append('\n');
            notesBuilder.append("Diesel: ")
                    .append(String.format(Locale.US, "%.2f L", totalDieselLiters))
                    .append(" • Avg: ")
                    .append(formatAverage(tripAverage));
        }
        if (!TextUtils.isEmpty(notes)) {
            if (notesBuilder.length() > 0) notesBuilder.append('\n');
            notesBuilder.append("Notes: ").append(notes);
        }
        tripNotesText.setText(notesBuilder.length() == 0
                ? getString(R.string.trip_notes_empty) : notesBuilder.toString());


    }

    private void bindLookingExpenses(
            LinearLayout section,
            LinearLayout list,
            TextView totalText,
            TextView countText,
            JSONArray expenses,
            double fallbackTotal
    ) {
        list.removeAllViews();
        if (expenses == null || expenses.length() == 0) {
            section.setVisibility(View.GONE);
            return;
        }

        double total = 0;
        int visibleCount = 0;
        for (int i = 0; i < expenses.length(); i++) {
            JSONObject expense = expenses.optJSONObject(i);
            if (expense == null) continue;
            visibleCount++;
            total += expense.optDouble("amount", 0);
            list.addView(createLookingExpenseRow(expense));
        }

        if (visibleCount == 0) {
            section.setVisibility(View.GONE);
            return;
        }

        section.setVisibility(View.VISIBLE);
        totalText.setText(formatCurrency(total > 0 ? total : fallbackTotal));
        countText.setText(getResources().getQuantityString(
                R.plurals.looking_expense_count,
                visibleCount,
                visibleCount
        ));
    }

    private View createLookingExpenseRow(JSONObject expense) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(android.view.Gravity.CENTER_VERTICAL);
        row.setBackgroundResource(R.drawable.bg_looking_expense_row);
        int padding = dp(10);
        row.setPadding(padding, padding, padding, padding);
        LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        rowParams.setMargins(0, 0, 0, dp(8));
        row.setLayoutParams(rowParams);

        LinearLayout textColumn = new LinearLayout(this);
        textColumn.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams textParams = new LinearLayout.LayoutParams(
                0,
                LinearLayout.LayoutParams.WRAP_CONTENT,
                1f
        );
        textColumn.setLayoutParams(textParams);

        TextView title = new TextView(this);
        title.setText(formatCategory(expense.optString("category", "other")));
        title.setTextColor(getColorCompat(R.color.section_title));
        title.setTextSize(13);
        title.setTypeface(title.getTypeface(), android.graphics.Typeface.BOLD);

        TextView meta = new TextView(this);
        String date = formatTimestamp(expense.optString("created_at", ""));
        String note = expense.optString("note", "");
        meta.setText(TextUtils.isEmpty(note) ? date : date + " • " + note);
        meta.setTextColor(getColorCompat(R.color.section_hint));
        meta.setTextSize(11);
        meta.setMaxLines(2);
        meta.setEllipsize(TextUtils.TruncateAt.END);

        textColumn.addView(title);
        textColumn.addView(meta);

        TextView amount = new TextView(this);
        amount.setText(formatCurrency(expense.optDouble("amount", 0)));
        amount.setTextColor(android.graphics.Color.rgb(159, 18, 57));
        amount.setTextSize(13);
        amount.setTypeface(amount.getTypeface(), android.graphics.Typeface.BOLD);
        amount.setPadding(dp(10), 0, 0, 0);

        row.addView(textColumn);
        row.addView(amount);
        return row;
    }

    private void bindImage(ImageView imageView, TextView hintView, String imageUrl, String title) {
        boolean hasImage = imageUrl != null && !imageUrl.trim().isEmpty()
                && !"null".equalsIgnoreCase(imageUrl);

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
        if (rawValue == null || rawValue.trim().isEmpty()
                || "null".equalsIgnoreCase(rawValue)) {
            return "-";
        }
        try {
            OffsetDateTime dateTime = OffsetDateTime.parse(rawValue);
            return dateTime.atZoneSameInstant(ZoneId.systemDefault()).format(DISPLAY_DATE_TIME);
        } catch (Exception e) {
            return rawValue;
        }
    }

    private String capitalize(String value) {
        if (value == null || value.isEmpty()) return "";
        return Character.toUpperCase(value.charAt(0)) + value.substring(1);
    }

    private String formatAverage(double value) {
        if (!(value > 0)) return "N/A";
        return String.format(Locale.US, "%.2f km/L", value);
    }

    private String formatCategory(String category) {
        if (TextUtils.isEmpty(category)) return "Other";
        String normalized = category.replace('_', ' ').trim();
        if (normalized.isEmpty()) return "Other";
        String[] parts = normalized.split("\\s+");
        StringBuilder builder = new StringBuilder();
        for (String part : parts) {
            if (part.isEmpty()) continue;
            if (builder.length() > 0) builder.append(' ');
            builder.append(Character.toUpperCase(part.charAt(0)));
            if (part.length() > 1) {
                builder.append(part.substring(1).toLowerCase(Locale.US));
            }
        }
        return builder.length() == 0 ? "Other" : builder.toString();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private int getColorCompat(int colorRes) {
        return getColor(colorRes);
    }
}
