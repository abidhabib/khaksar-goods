package com.example.ishaqcargo.network;

import android.content.ContentResolver;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.webkit.MimeTypeMap;

import androidx.annotation.NonNull;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.concurrent.TimeUnit;
import java.util.Map;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.FormBody;
import okhttp3.MediaType;
import okhttp3.MultipartBody;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

public class ApiClient {
    private static final int MAX_IMAGE_DIMENSION = 1600;
    private static final int JPEG_QUALITY = 72;
    private static final OkHttpClient CLIENT = new OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(90, TimeUnit.SECONDS)
            .writeTimeout(90, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build();
    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");

    public static void login(String baseUrl, String username, String password, Callback callback) {
        JSONObject bodyJson = new JSONObject();
        try {
            bodyJson.put("username", username);
            bodyJson.put("password", password);
        } catch (JSONException ignored) {
        }

        RequestBody body = RequestBody.create(bodyJson.toString(), JSON);
        Request request = new Request.Builder()
                .url(baseUrl + "/auth/login")
                .post(body)
                .build();

        CLIENT.newCall(request).enqueue(callback);
    }

    public static void getDriverDashboard(String baseUrl, String token, Callback callback) {
        Request request = new Request.Builder()
                .url(baseUrl + "/driver/dashboard")
                .get()
                .header("Authorization", "Bearer " + token)
                .build();

        CLIENT.newCall(request).enqueue(callback);
    }

    public static void startTrip(
            String baseUrl,
            String token,
            Map<String, String> fields,
            Uri meterImageUri,
            Uri biltySlipImageUri,
            ContentResolver contentResolver,
            Callback callback
    ) {
        Map<String, Uri> fileUris = new LinkedHashMap<>();
        fileUris.put("meter_image", meterImageUri);
        fileUris.put("bilty_slip_image", biltySlipImageUri);
        RequestBody requestBody = buildFormRequestBody(fields, fileUris, contentResolver);

        Request request = new Request.Builder()
                .url(baseUrl + "/driver/trips/start")
                .post(requestBody)
                .header("Authorization", "Bearer " + token)
                .build();

        CLIENT.newCall(request).enqueue(callback);
    }

    public static void saveTripLoadDetails(
            String baseUrl,
            String token,
            String tripId,
            Map<String, String> fields,
            Uri loadPhotoUri,
            ContentResolver contentResolver,
            Callback callback
    ) {
        Map<String, Uri> fileUris = new LinkedHashMap<>();
        fileUris.put("load_photo", loadPhotoUri);
        RequestBody requestBody = buildFormRequestBody(fields, fileUris, contentResolver);

        Request request = new Request.Builder()
                .url(baseUrl + "/driver/trips/" + tripId + "/load-details")
                .post(requestBody)
                .header("Authorization", "Bearer " + token)
                .build();

        CLIENT.newCall(request).enqueue(callback);
    }

    public static void endTrip(
            String baseUrl,
            String token,
            String tripId,
            Map<String, String> fields,
            Uri meterImageUri,
            ContentResolver contentResolver,
            Callback callback
    ) {
        Map<String, Uri> fileUris = new LinkedHashMap<>();
        fileUris.put("meter_image", meterImageUri);
        RequestBody requestBody = buildFormRequestBody(fields, fileUris, contentResolver);

        Request request = new Request.Builder()
                .url(baseUrl + "/driver/trips/" + tripId + "/end")
                .post(requestBody)
                .header("Authorization", "Bearer " + token)
                .build();

        CLIENT.newCall(request).enqueue(callback);
    }

    private static RequestBody buildFormRequestBody(
            Map<String, String> fields,
            Map<String, Uri> fileUris,
            ContentResolver contentResolver
    ) {
        boolean hasFiles = false;
        if (fileUris != null) {
            for (Uri value : fileUris.values()) {
                if (value != null) {
                    hasFiles = true;
                    break;
                }
            }
        }

        if (!hasFiles || contentResolver == null) {
            FormBody.Builder formBuilder = new FormBody.Builder();
            for (Map.Entry<String, String> entry : fields.entrySet()) {
                formBuilder.add(entry.getKey(), entry.getValue());
            }
            return formBuilder.build();
        }

        MultipartBody.Builder multipartBuilder = new MultipartBody.Builder().setType(MultipartBody.FORM);
        for (Map.Entry<String, String> entry : fields.entrySet()) {
            multipartBuilder.addFormDataPart(entry.getKey(), entry.getValue());
        }
        if (fileUris != null) {
            for (Map.Entry<String, Uri> entry : fileUris.entrySet()) {
                addImagePartIfExists(multipartBuilder, entry.getValue(), contentResolver, entry.getKey(), entry.getKey());
            }
        }
        return multipartBuilder.build();
    }

    public static void getTripHistory(String baseUrl, String token, int limit, Callback callback) {
        Request request = new Request.Builder()
                .url(baseUrl + "/driver/trips?limit=" + limit)
                .get()
                .header("Authorization", "Bearer " + token)
                .build();

        CLIENT.newCall(request).enqueue(callback);
    }

    public static void getTripDetails(String baseUrl, String token, String tripId, Callback callback) {
        Request request = new Request.Builder()
                .url(baseUrl + "/driver/trips/" + tripId)
                .get()
                .header("Authorization", "Bearer " + token)
                .build();

        CLIENT.newCall(request).enqueue(callback);
    }

    public static void addTripExpense(
            String baseUrl,
            String token,
            String tripId,
            Map<String, String> fields,
            Uri receiptImageUri,
            ContentResolver contentResolver,
            Callback callback
    ) {
        MultipartBody.Builder multipartBuilder = new MultipartBody.Builder().setType(MultipartBody.FORM);
        for (Map.Entry<String, String> entry : fields.entrySet()) {
            multipartBuilder.addFormDataPart(entry.getKey(), entry.getValue());
        }
        if (receiptImageUri != null && contentResolver != null) {
            addImagePartIfExists(multipartBuilder, receiptImageUri, contentResolver, "receipt_image", "receipt_image");
        }

        Request request = new Request.Builder()
                .url(baseUrl + "/driver/trips/" + tripId + "/expenses")
                .post(multipartBuilder.build())
                .header("Authorization", "Bearer " + token)
                .build();

        CLIENT.newCall(request).enqueue(callback);
    }

    public static void getDailyExpenses(String baseUrl, String token, String month, Callback callback) {
        String url = baseUrl + "/driver/daily-expenses";
        if (month != null && !month.trim().isEmpty()) {
            url += "?month=" + month.trim();
        }

        Request request = new Request.Builder()
                .url(url)
                .get()
                .header("Authorization", "Bearer " + token)
                .build();

        CLIENT.newCall(request).enqueue(callback);
    }

    public static void saveDailyExpense(String baseUrl, String token, Map<String, String> fields, Callback callback) {
        FormBody.Builder formBuilder = new FormBody.Builder();
        for (Map.Entry<String, String> entry : fields.entrySet()) {
            formBuilder.add(entry.getKey(), entry.getValue());
        }

        Request request = new Request.Builder()
                .url(baseUrl + "/driver/daily-expenses")
                .post(formBuilder.build())
                .header("Authorization", "Bearer " + token)
                .build();

        CLIENT.newCall(request).enqueue(callback);
    }

    public static void submitCompanyPayment(
            String baseUrl,
            String token,
            Map<String, String> fields,
            Uri screenshotUri,
            ContentResolver contentResolver,
            Callback callback
    ) {
        Map<String, Uri> fileUris = new LinkedHashMap<>();
        fileUris.put("payment_screenshot", screenshotUri);
        RequestBody requestBody = buildFormRequestBody(fields, fileUris, contentResolver);

        Request request = new Request.Builder()
                .url(baseUrl + "/driver/company-payments")
                .post(requestBody)
                .header("Authorization", "Bearer " + token)
                .build();

        CLIENT.newCall(request).enqueue(callback);
    }

    public static void getCompanyPayments(String baseUrl, String token, String month, Callback callback) {
        String url = baseUrl + "/driver/company-payments";
        if (month != null && !month.trim().isEmpty()) {
            url += "?month=" + month.trim();
        }

        Request request = new Request.Builder()
                .url(url)
                .get()
                .header("Authorization", "Bearer " + token)
                .build();

        CLIENT.newCall(request).enqueue(callback);
    }

    private static void addImagePartIfExists(
            MultipartBody.Builder builder,
            Uri uri,
            ContentResolver resolver,
            String fieldName,
            String defaultName
    ) {
        if (uri == null || resolver == null) {
            return;
        }

        try {
            String mimeType = resolver.getType(uri);
            if (mimeType == null || mimeType.trim().isEmpty()) {
                mimeType = "image/jpeg";
            }

            byte[] imageBytes = readImageBytes(resolver, uri, mimeType);
            if (imageBytes == null) {
                return;
            }

            String extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType);
            if (extension == null || extension.trim().isEmpty()) {
                extension = "jpg";
            }

            String fileName = defaultName + "." + extension;
            RequestBody imageBody = RequestBody.create(imageBytes, MediaType.get("image/jpeg"));
            builder.addFormDataPart(fieldName, fileName, imageBody);
        } catch (Exception ignored) {
        }
    }

    private static byte[] readImageBytes(ContentResolver resolver, Uri uri, String mimeType) throws IOException {
        if (mimeType.startsWith("image/")) {
            byte[] compressedBytes = readCompressedImageBytes(resolver, uri);
            if (compressedBytes != null) {
                return compressedBytes;
            }
        }

        return readAllBytes(resolver, uri);
    }

    private static byte[] readCompressedImageBytes(ContentResolver resolver, Uri uri) throws IOException {
        BitmapFactory.Options boundsOptions = new BitmapFactory.Options();
        boundsOptions.inJustDecodeBounds = true;

        InputStream boundsStream = resolver.openInputStream(uri);
        if (boundsStream == null) {
            return null;
        }
        BitmapFactory.decodeStream(boundsStream, null, boundsOptions);
        boundsStream.close();

        BitmapFactory.Options bitmapOptions = new BitmapFactory.Options();
        bitmapOptions.inSampleSize = calculateInSampleSize(boundsOptions, MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION);

        InputStream bitmapStream = resolver.openInputStream(uri);
        if (bitmapStream == null) {
            return null;
        }

        Bitmap bitmap = BitmapFactory.decodeStream(bitmapStream, null, bitmapOptions);
        bitmapStream.close();
        if (bitmap == null) {
            return null;
        }

        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, outputStream);
        bitmap.recycle();
        return outputStream.toByteArray();
    }

    private static int calculateInSampleSize(BitmapFactory.Options options, int reqWidth, int reqHeight) {
        int height = options.outHeight;
        int width = options.outWidth;
        int inSampleSize = 1;

        while ((height / inSampleSize) > reqHeight || (width / inSampleSize) > reqWidth) {
            inSampleSize *= 2;
        }

        return Math.max(inSampleSize, 1);
    }

    private static byte[] readAllBytes(ContentResolver resolver, Uri uri) throws IOException {
        InputStream inputStream = resolver.openInputStream(uri);
        if (inputStream == null) {
            return null;
        }

        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] data = new byte[8192];
        int nRead;
        while ((nRead = inputStream.read(data, 0, data.length)) != -1) {
            buffer.write(data, 0, nRead);
        }
        inputStream.close();
        return buffer.toByteArray();
    }

    public static String parseErrorMessage(@NonNull Response response, String fallback) {
        try {
            if (response.body() == null) {
                return fallback;
            }
            return parseErrorMessage(response.body().string(), fallback);
        } catch (Exception ignored) {
            return fallback;
        }
    }

    public static String parseErrorMessage(String body, String fallback) {
        try {
            if (body == null || body.trim().isEmpty()) {
                return fallback;
            }

            JSONObject jsonObject = new JSONObject(body);
            return jsonObject.optString("message", fallback);
        } catch (Exception ignored) {
            return fallback;
        }
    }
}
