package com.example.ishaqcargo;

import android.os.Bundle;

import androidx.appcompat.app.AppCompatActivity;

import com.bumptech.glide.Glide;
import com.example.ishaqcargo.databinding.ActivityImagePreviewBinding;

public class ImagePreviewActivity extends AppCompatActivity {

    public static final String EXTRA_IMAGE_URL = "image_url";
    public static final String EXTRA_TITLE = "image_title";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ActivityImagePreviewBinding binding = ActivityImagePreviewBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());

        String imageUrl = getIntent().getStringExtra(EXTRA_IMAGE_URL);
        String title = getIntent().getStringExtra(EXTRA_TITLE);

        binding.previewTitle.setText(title == null || title.trim().isEmpty() ? "Trip image" : title);
        binding.closeButton.setOnClickListener(v -> finish());
        binding.previewImage.setOnClickListener(v -> finish());

        Glide.with(this)
                .load(imageUrl)
                .placeholder(R.drawable.bg_image_placeholder)
                .error(R.drawable.bg_image_placeholder)
                .into(binding.previewImage);
    }
}
